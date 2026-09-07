import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertCanAccessAgent, createCookieSupabase, requireImportUser } from '@/lib/import-mapper/auth';
import { buildImportPlan } from '@/lib/import-mapper/planner';
import { ColumnMapping, ImportSourceRow } from '@/lib/import-mapper/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DryRunBody {
  agentId?: string;
  filename?: string;
  sourceType?: string;
  mapping?: ColumnMapping;
  rows?: ImportSourceRow[];
}

export async function POST(request: Request) {
  try {
    const supabase = createCookieSupabase(await cookies());
    const user = await requireImportUser(supabase);
    const body = (await request.json()) as DryRunBody;
    const agentId = body.agentId;

    if (!agentId || !body.mapping || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'agentId, mapping, and rows are required.' }, { status: 400 });
    }

    await assertCanAccessAgent(supabase, agentId);

    const { data: clients, error } = await supabase
      .from('clients')
      .select(`
        id,
        full_name,
        email,
        phone,
        client_personal_information(date_of_birth, ssn, email, phone)
      `)
      .eq('agent_id', agentId)
      .limit(5000);

    if (error) throw error;

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

    await supabase.from('import_runs').insert({
      agent_id: agentId,
      imported_by: user.id,
      filename: body.filename || 'uploaded file',
      source_type: body.sourceType || 'unknown',
      mapping_used: body.mapping,
      status: 'dry_run',
      rows_processed: plan.summary.totalRows,
      skipped_count: plan.summary.recordsSkipped,
      warnings: plan.rows.flatMap((row) => row.issues.filter((issue) => issue.severity === 'warning')),
      errors: plan.rows.flatMap((row) => row.issues.filter((issue) => issue.severity === 'error')),
      import_plan: plan,
    });

    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build dry run.';
    const status = message.includes('Unauthorized') ? 401 : message.includes('access') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
