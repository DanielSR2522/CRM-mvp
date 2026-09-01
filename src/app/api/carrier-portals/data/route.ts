import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCarrierPaymentStatus } from '@/lib/carrier-portals/payment-semantics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedCarrier = (searchParams.get('carrier') || 'all').toLowerCase();

    // 1. Fetch ALL carrier connections for this agent
    const { data: allConnections } = await supabase
      .from('carrier_connections')
      .select('*')
      .eq('agent_id', user.id);

    const connectionsList = allConnections || [];
    const oscarConn = connectionsList.find((c: any) => c.carrier === 'oscar') || null;

    // 2. Identify active sync runs for each carrier
    const { data: completedRuns } = await supabase
      .from('carrier_sync_runs')
      .select('id, carrier, records_found, completed_at')
      .eq('agent_id', user.id)
      .eq('status', 'completed')
      .gt('records_found', 0)
      .order('completed_at', { ascending: false });

    // Build map of carrier -> active sync_run_id
    const activeRunIdMap = new Map<string, string>();
    connectionsList.forEach((conn: any) => {
      if (conn.last_successful_sync_run_id) {
        activeRunIdMap.set(conn.carrier.toLowerCase(), conn.last_successful_sync_run_id);
      }
    });

    (completedRuns || []).forEach((run: any) => {
      const c = run.carrier.toLowerCase();
      if (!activeRunIdMap.has(c)) {
        activeRunIdMap.set(c, run.id);
      }
    });

    // 3. Fetch carrier records for active versions across all carriers
    let recordsQuery = supabase
      .from('carrier_records')
      .select('*')
      .eq('agent_id', user.id);

    if (requestedCarrier !== 'all') {
      recordsQuery = recordsQuery.eq('carrier', requestedCarrier);
    }

    const { data: rawRecords } = await recordsQuery.order('last_seen_at', { ascending: false });
    const recordsList = rawRecords || [];

    // Filter to active run ID per carrier if active run ID exists for that carrier
    const activeRecords = recordsList.filter((r: any) => {
      const c = r.carrier.toLowerCase();
      const activeRunId = activeRunIdMap.get(c);
      if (activeRunId) {
        return r.latest_sync_run_id === activeRunId;
      }
      return true; // Fallback to baseline records if no sync run ID is mapped
    });

    // 4. Fetch client matches
    let matchesQuery = supabase
      .from('carrier_client_matches')
      .select('*, client:clients(id, full_name, email, phone)')
      .eq('agent_id', user.id);

    if (requestedCarrier !== 'all') {
      matchesQuery = matchesQuery.eq('carrier', requestedCarrier);
    }

    const { data: matches } = await matchesQuery;
    const matchesMap = new Map<string, any>();
    (matches || []).forEach((m: any) => {
      matchesMap.set(`${m.carrier.toLowerCase()}:${m.external_member_id}`, m);
    });

    // Get current local business date (America/New_York) formatted YYYY-MM-DD for date-only comparisons
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // 5. Enrich records with matches, payment semantics, and AutoPay status
    const enrichedRecords = activeRecords.map((r: any) => {
      const match = matchesMap.get(`${r.carrier.toLowerCase()}:${r.external_member_id}`);
      const paymentInfo = getCarrierPaymentStatus(r, todayStr);

      return {
        ...r,
        paid_through_date: paymentInfo.paidThroughDate,
        last_payment_date: paymentInfo.lastPaymentDate,
        suggested_action: paymentInfo.suggestedAction,
        payment_due: paymentInfo.paymentDue,
        payment_status_label: paymentInfo.paymentStatusLabel,
        autopay_status: paymentInfo.autopayStatus,
        amount_due: paymentInfo.amountDue,
        amount_due_formatted: paymentInfo.amountDueFormatted,
        match: match || {
          match_status: 'unmatched',
          confidence_score: 0,
          client: null,
        },
      };
    });

    // 6. Fetch events & syncRuns
    let eventsQuery = supabase.from('carrier_events').select('*').eq('agent_id', user.id);
    if (requestedCarrier !== 'all') eventsQuery = eventsQuery.eq('carrier', requestedCarrier);
    const { data: events } = await eventsQuery.order('created_at', { ascending: false });

    let runsQuery = supabase.from('carrier_sync_runs').select('*').eq('agent_id', user.id);
    if (requestedCarrier !== 'all') runsQuery = runsQuery.eq('carrier', requestedCarrier);
    const { data: syncRuns } = await runsQuery.order('started_at', { ascending: false });

    // 7. Calculate aggregate KPIs
    const totalPolicies = enrichedRecords.length;
    const activePolicies = enrichedRecords.filter((r) => r.carrier_status === 'active').length;
    const inactivePolicies = enrichedRecords.filter((r) => r.carrier_status === 'inactive').length;
    const gracePeriodCount = enrichedRecords.filter((r) => r.carrier_status === 'grace_period').length;
    const paymentsDueCount = enrichedRecords.filter((r) => r.payment_due).length;
    const notOnAutopayCount = enrichedRecords.filter((r) => r.autopay_status === 'not_enrolled').length;
    const totalBalanceDue = enrichedRecords.reduce((sum, r) => sum + Number(r.amount_due || 0), 0);
    const unmatchedCount = enrichedRecords.filter((r) => r.match.match_status === 'unmatched').length;
    const reviewCount = enrichedRecords.filter((r) => r.match.match_status === 'review').length;
    const matchedCount = enrichedRecords.filter((r) => r.match.match_status === 'matched').length;

    // Helper CSV line parser function
    function parseCsvLine(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result.map(s => s.replace(/^["']|["']$/g, ''));
    }

    // Primary connection for backwards compatibility with Oscar UI
    const primaryConnection =
      requestedCarrier !== 'all'
        ? connectionsList.find((c: any) => c.carrier === requestedCarrier) || oscarConn
        : oscarConn || connectionsList[0] || null;

    return NextResponse.json({
      success: true,
      connection: primaryConnection,
      allConnections: connectionsList,
      kpis: {
        totalPolicies,
        activePolicies,
        inactivePolicies,
        gracePeriodCount,
        paymentsDueCount,
        totalBalanceDue,
        matchedCount,
        reviewCount,
        unmatchedCount,
        policyChangesCount: (events || []).length,
        lastSyncAt: primaryConnection?.last_sync_at || null,
        lastSuccessAt: primaryConnection?.last_success_at || null,
        syncSource: primaryConnection?.sync_source || 'manual_csv',
      },
      records: enrichedRecords,
      matches: matches || [],
      events: events || [],
      syncRuns: syncRuns || [],
    });
  } catch (err: any) {
    console.error('Error fetching carrier portals data:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch carrier portals data.' },
      { status: 500 }
    );
  }
}
