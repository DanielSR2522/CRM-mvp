import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertCanAccessAgent, createCookieSupabase, requireImportUser } from '@/lib/import-mapper/auth';
import { buildImportPlan } from '@/lib/import-mapper/planner';
import { ColumnMapping, DuplicateAction, ImportSourceRow } from '@/lib/import-mapper/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ImportBody {
  agentId?: string;
  filename?: string;
  sourceType?: string;
  mapping?: ColumnMapping;
  rows?: ImportSourceRow[];
  rowActions?: Record<number, { action: DuplicateAction; clientId?: string }>;
  confirm?: boolean;
}

export async function POST(request: Request) {
  try {
    const supabase = createCookieSupabase(await cookies());
    const user = await requireImportUser(supabase);
    const body = (await request.json()) as ImportBody;

    if (!body.confirm) {
      return NextResponse.json({ error: 'Explicit confirmation is required before import.' }, { status: 400 });
    }
    if (!body.agentId || !body.mapping || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'agentId, mapping, and rows are required.' }, { status: 400 });
    }

    await assertCanAccessAgent(supabase, body.agentId);

    const { data: clients } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, client_personal_information(date_of_birth, ssn, email, phone)')
      .eq('agent_id', body.agentId)
      .limit(5000);

    const existingClients = (clients ?? []).map((client) => ({
      id: client.id,
      full_name: client.full_name ?? null,
      email: client.email ?? null,
      phone: client.phone ?? null,
      personal: Array.isArray(client.client_personal_information)
        ? client.client_personal_information[0] ?? null
        : client.client_personal_information ?? null,
    }));
    const plan = buildImportPlan(body.rows, body.mapping, existingClients);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ rowNumber: number; message: string }> = [];

    for (const row of plan.rows) {
      const explicitAction = body.rowActions?.[row.rowNumber]?.action ?? row.duplicateAction;
      const targetClientId = body.rowActions?.[row.rowNumber]?.clientId ?? row.duplicateCandidates[0]?.clientId;

      if (row.issues.some((issue) => issue.severity === 'error') || explicitAction === 'review' || explicitAction === 'skip') {
        skipped += 1;
        continue;
      }

      try {
        const clientId = explicitAction === 'update_existing' && targetClientId
          ? await updateClient(supabase, targetClientId, row)
          : await createClientRecord(supabase, body.agentId, row);

        if (explicitAction === 'update_existing' && targetClientId) {
          updated += 1;
        } else {
          created += 1;
        }

        if (Object.values(row.healthPolicy).some((value) => value !== null && value !== '')) {
          await supabase.from('health_policies').insert({
            client_id: clientId,
            active: row.healthPolicy.status?.toLowerCase() === 'active',
            policy_status: row.healthPolicy.status || null,
            action_pending: row.healthPolicy.pendingAction || row.pendingAction || null,
            company_2026: row.healthPolicy.carrier || null,
            application_number: row.healthPolicy.marketplaceApplicationId || row.healthPolicy.policyNumber || null,
            plan_id: row.healthPolicy.policyNumber || null,
            plan_name: row.healthPolicy.plan || null,
            no_membership: row.healthPolicy.memberId || null,
            plan_cost: row.healthPolicy.premium ?? 0,
            tax_credit: row.healthPolicy.taxCredit ?? 0,
            effective_date: row.healthPolicy.effectiveDate,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        failed += 1;
        errors.push({
          rowNumber: row.rowNumber,
          message: error instanceof Error ? error.message : 'Import row failed.',
        });
      }
    }

    const { data: run } = await supabase.from('import_runs').insert({
      agent_id: body.agentId,
      imported_by: user.id,
      filename: body.filename || 'uploaded file',
      source_type: body.sourceType || 'unknown',
      mapping_used: body.mapping,
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      rows_processed: plan.summary.totalRows,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped,
      failed_count: failed,
      errors,
      import_plan: plan,
      completed_at: new Date().toISOString(),
    }).select('id').single();

    return NextResponse.json({
      importRunId: run?.id ?? null,
      created,
      updated,
      skipped,
      failed,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import file.';
    const status = message.includes('Unauthorized') ? 401 : message.includes('access') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function createClientRecord(supabase: ReturnType<typeof createCookieSupabase>, agentId: string, row: ReturnType<typeof buildImportPlan>['rows'][number]) {
  const address = [row.client.address, row.client.city, row.client.state, row.client.zip].filter(Boolean).join(', ') || null;
  const { data: client, error } = await supabase.from('clients').insert({
    agent_id: agentId,
    client_type: 'personal',
    full_name: row.client.fullName,
    address,
    email: row.client.email,
    phone: row.client.phone,
    updated_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  await upsertClientDetails(supabase, client.id, row);
  return client.id as string;
}

async function updateClient(supabase: ReturnType<typeof createCookieSupabase>, clientId: string, row: ReturnType<typeof buildImportPlan>['rows'][number]) {
  const address = [row.client.address, row.client.city, row.client.state, row.client.zip].filter(Boolean).join(', ') || null;
  const patch: Record<string, string | null> = {};
  if (row.client.fullName) patch.full_name = row.client.fullName;
  if (row.client.email) patch.email = row.client.email;
  if (row.client.phone) patch.phone = row.client.phone;
  if (address) patch.address = address;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', clientId);
    if (error) throw error;
  }
  await upsertClientDetails(supabase, clientId, row);
  return clientId;
}

async function upsertClientDetails(supabase: ReturnType<typeof createCookieSupabase>, clientId: string, row: ReturnType<typeof buildImportPlan>['rows'][number]) {
  await supabase.from('client_personal_information').upsert({
    client_id: clientId,
    full_name: row.client.fullName,
    date_of_birth: row.client.dateOfBirth,
    ssn: row.client.ssn,
    email: row.client.email,
    phone: row.client.phone,
    has_co_applicant: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id' });

  if (row.client.address || row.client.city || row.client.state || row.client.zip) {
    await supabase.from('client_residence_information').upsert({
      client_id: clientId,
      address: row.client.address,
      city: row.client.city,
      state: row.client.state,
      zip_code: row.client.zip,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });
  }
}
