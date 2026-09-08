import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { AudienceFilters } from '@/types/marketing';
import { evaluateRecipientSafety, RawRecipientCandidate } from './safety-engine';

export async function evaluateSegmentCandidates(
  filters: AudienceFilters,
  dbClient: SupabaseClient = supabase,
  authorizedAgentIds?: string[]
): Promise<{ candidates: RawRecipientCandidate[]; suppressedEmails: Set<string>; hardBouncedEmails: Set<string> }> {
  try {
    const client = dbClient || supabase;
    // 1. Fetch suppressions
    const { data: suppressions } = await client.from('marketing_suppressions').select('email, reason');
    const suppressedEmails = new Set<string>();
    const hardBouncedEmails = new Set<string>();

    (suppressions || []).forEach((s) => {
      const em = (s.email || '').trim().toLowerCase();
      if (em) {
        if (s.reason === 'HARD_BOUNCE') hardBouncedEmails.add(em);
        else suppressedEmails.add(em);
      }
    });

    // 2. Build Client Query with Strict Multi-Tenant Agent Scoping
    let query = client.from('clients').select('id, full_name, email, client_type, address, created_at, agent_id');

    if (authorizedAgentIds && authorizedAgentIds.length > 0) {
      query = query.in('agent_id', authorizedAgentIds);
    }

    if (filters.client) {
      const c = filters.client;
      if (c.assignedAgentId) query = query.eq('agent_id', c.assignedAgentId);
      if (c.createdFrom) query = query.gte('created_at', c.createdFrom);
      if (c.createdTo) query = query.lte('created_at', c.createdTo);
    }

    const { data: clientsData, error } = await query;
    if (error) {
      console.error('Segment query client error:', error.message);
      return { candidates: [], suppressedEmails, hardBouncedEmails };
    }

    let clients = clientsData || [];

    // Filter in-memory for complex client/policy filters
    if (filters.client) {
      const c = filters.client;
      if (c.state) {
        clients = clients.filter((cl: any) => {
          const addrStr = JSON.stringify(cl.address || {}).toLowerCase();
          return addrStr.includes(c.state!.toLowerCase());
        });
      }
      if (c.city) {
        clients = clients.filter((cl: any) => {
          const addrStr = JSON.stringify(cl.address || {}).toLowerCase();
          return addrStr.includes(c.city!.toLowerCase());
        });
      }
      if (c.zipCode) {
        clients = clients.filter((cl: any) => {
          const addrStr = JSON.stringify(cl.address || {}).toLowerCase();
          return addrStr.includes(c.zipCode!);
        });
      }
    }

    // Policy filters check
    if (filters.policy && Object.keys(filters.policy).length > 0) {
      const { data: policiesData } = await client.from('health_policies').select('client_id, company_name, status, expiration_date');
      if (policiesData && policiesData.length > 0) {
        const clientIdsWithMatchingPolicy = new Set<string>();
        const p = filters.policy;

        policiesData.forEach((pol: any) => {
          let match = true;
          if (p.carrier && pol.company_name && !pol.company_name.toLowerCase().includes(p.carrier.toLowerCase())) {
            match = false;
          }
          if (p.policyStatus && p.policyStatus !== 'all' && pol.status !== p.policyStatus) {
            match = false;
          }
          if (p.renewalWithinDays && pol.expiration_date) {
            const today = new Date();
            const exp = new Date(pol.expiration_date);
            const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (diffDays < 0 || diffDays > p.renewalWithinDays) match = false;
          }

          if (match && pol.client_id) clientIdsWithMatchingPolicy.add(pol.client_id);
        });

        clients = clients.filter((cl) => clientIdsWithMatchingPolicy.has(cl.id));
      }
    }

    const candidates: RawRecipientCandidate[] = clients.map((cl: any) => {
      let state = 'FL';
      if (cl.address) {
        if (typeof cl.address === 'object' && cl.address.state) state = cl.address.state;
        else if (typeof cl.address === 'string') {
          try {
            const parsed = JSON.parse(cl.address);
            if (parsed.state) state = parsed.state;
          } catch {
            state = 'FL';
          }
        }
      }

      return {
        email: cl.email || '',
        name: cl.full_name || 'Client',
        clientId: cl.id,
        state,
        carrier: cl.carrier || 'Ambetter',
        policyStatus: 'Active',
        assignedAgent: cl.agent_id ? 'Assigned Agent' : 'Agent',
        expirationDate: '2026-12-31',
        hasMarketingConsent: true,
      };
    });

    // Add leads if applicable (strictly scoped to authorizedAgentIds)
    let leadsQuery = client.from('leads').select('id, full_name, email, status, agent_id');
    if (authorizedAgentIds && authorizedAgentIds.length > 0) {
      leadsQuery = leadsQuery.in('agent_id', authorizedAgentIds);
    }
    const { data: leadsData } = await leadsQuery;
    if (leadsData) {
      leadsData.forEach((ld: any) => {
        if (ld.email) {
          candidates.push({
            email: ld.email,
            name: ld.full_name || 'Lead',
            leadId: ld.id,
            state: 'FL',
            carrier: 'Ambetter',
            policyStatus: ld.status || 'Active',
            assignedAgent: ld.agent_id ? 'Assigned Agent' : 'Agent',
            expirationDate: '2026-12-31',
            hasMarketingConsent: true,
          });
        }
      });
    }

    return { candidates, suppressedEmails, hardBouncedEmails };
  } catch (err: any) {
    console.error('Error evaluating segment candidates:', err?.message);
    return { candidates: [], suppressedEmails: new Set(), hardBouncedEmails: new Set() };
  }
}
