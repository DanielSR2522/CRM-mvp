import { createClient } from '@supabase/supabase-js';

export const LONI_PROFILE_ID = 'd1c696ef-c77d-4b2b-a3f5-83acd965c363';

export interface LoniRenewalClient {
  id: string;
  client_id: string;
  full_name: string;
  company: string;
  company_2026: string;
  plan_name: string;
  phone: string;
  email: string;
  agent_profile_id: string;
  agent_name: string;
}

export async function getLoniRenewalHealthClients(): Promise<{
  clients: LoniRenewalClient[];
  totalHpCount: number;
  distinctClientCount: number;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials missing');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Total Health policies count
  const { data: allHp, error: hpErr } = await supabase
    .from('health_policies')
    .select('id, client_id, company_2026, plan_name');

  if (hpErr) throw hpErr;

  const totalHpCount = allHp?.length || 0;
  const distinctClientIds = Array.from(new Set((allHp || []).map((p) => p.client_id).filter(Boolean)));
  const distinctClientCount = distinctClientIds.length;

  // 2. Query clients assigned to Loni via clients.agent_id
  const { data: loniClients, error: cErr } = await supabase
    .from('clients')
    .select('id, full_name, phone, email, agent_id')
    .eq('agent_id', LONI_PROFILE_ID);

  if (cErr) throw cErr;

  const loniClientIds = (loniClients || []).map((c) => c.id);

  // 3. Query health policies belonging to Loni's clients
  const { data: loniHp, error: loniHpErr } = await supabase
    .from('health_policies')
    .select('id, client_id, company_2026, plan_name')
    .in('client_id', loniClientIds.length > 0 ? loniClientIds : ['00000000-0000-0000-0000-000000000000']);

  if (loniHpErr) throw loniHpErr;

  const hpMap = new Map();
  (loniHp || []).forEach((p) => {
    if (!hpMap.has(p.client_id)) {
      hpMap.set(p.client_id, p);
    }
  });

  const clients: LoniRenewalClient[] = (loniClients || [])
    .filter((c) => hpMap.has(c.id))
    .map((c) => {
      const hp = hpMap.get(c.id) || {};
      const company = hp.company_2026 || 'Florida Blue';
      const planName = hp.plan_name || 'ACA Health Plan';
      return {
        id: c.id,
        client_id: c.id,
        full_name: c.full_name || `Client ${c.id.slice(0, 8)}`,
        company: company,
        company_2026: company,
        plan_name: planName,
        phone: c.phone || '—',
        email: c.email || '—',
        agent_profile_id: LONI_PROFILE_ID,
        agent_name: 'Loni Oliveira De Souza',
      };
    });

  return {
    clients,
    totalHpCount,
    distinctClientCount,
  };
}
