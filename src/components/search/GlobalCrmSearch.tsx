'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export interface SearchResultItem {
  id: string;
  category: 'clients' | 'leads' | 'pc' | 'health' | 'life' | 'companies';
  title: string;
  subtitle: string;
  badge?: string;
  targetUrl: string;
}

export interface GroupedSearchResults {
  clients: SearchResultItem[];
  leads: SearchResultItem[];
  pc: SearchResultItem[];
  health: SearchResultItem[];
  life: SearchResultItem[];
  companies: SearchResultItem[];
}

export default function GlobalCrmSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<GroupedSearchResults>({
    clients: [],
    leads: [],
    pc: [],
    health: [],
    life: [],
    companies: [],
  });

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Debounce search execution
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults({ clients: [], leads: [], pc: [], health: [], life: [], companies: [] });
      setLoading(false);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setIsOpen(true);

    const timer = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          setLoading(false);
          return;
        }

        const agentId = session.user.id;
        const q = trimmed;

        // 1. Fetch Accessible Clients for client-linked policy filters
        const { data: rawAgentClients } = await supabase
          .from('clients')
          .select('id, full_name, agency_name, email, phone, address, agent_id, policies(id)');

        const agentClients = (rawAgentClients || []).filter((c: any) => {
          if (c.agent_id === agentId) return true;
          return Array.isArray(c.policies) && c.policies.length > 0;
        });

        const clientMap = new Map((agentClients || []).map(c => [c.id, c.full_name || 'Client']));
        const agentClientIds = Array.from(clientMap.keys());
        const ownerClientIds = Array.from(new Set((rawAgentClients || []).filter((c: any) => c.agent_id === agentId).map(c => c.id)));

        // 2. Parallel queries across all CRM modules
        const [
          rawClientsRes,
          leadsRes,
          rawCompaniesRes,
          pcRes,
          healthRes,
          lifePolRes
        ] = await Promise.all([
          // Clients
          supabase
            .from('clients')
            .select('id, full_name, agency_name, email, phone, address, agent_id, policies(id)')
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,address.ilike.%${q}%,agency_name.ilike.%${q}%`)
            .limit(10),

          // Leads
          supabase
            .from('leads')
            .select('id, first_name, last_name, email, phone, status, product_interest')
            .eq('agent_id', agentId)
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
            .limit(5),

          // Companies (Commercial clients)
          supabase
            .from('clients')
            .select('id, full_name, agency_name, email, phone')
            .not('agency_name', 'is', null)
            .or(`agency_name.ilike.%${q}%,full_name.ilike.%${q}%`)
            .limit(5),

          // P&C Policies
          agentClientIds.length > 0
            ? supabase
                .from('policies')
                .select('id, policy_number, policy_type, company_name, writing_company, client_id')
                .in('client_id', agentClientIds)
                .or(`policy_number.ilike.%${q}%,policy_type.ilike.%${q}%,company_name.ilike.%${q}%,writing_company.ilike.%${q}%`)
                .limit(5)
            : Promise.resolve({ data: [] }),

          // Health Policies (Owner-Private)
          ownerClientIds.length > 0
            ? supabase
                .from('health_policies')
                .select('id, client_id, plan_name, company_2026, renovation_status, plan_id, application_number')
                .in('client_id', ownerClientIds)
                .or(`plan_name.ilike.%${q}%,company_2026.ilike.%${q}%,renovation_status.ilike.%${q}%,plan_id.ilike.%${q}%,application_number.ilike.%${q}%`)
                .limit(5)
            : Promise.resolve({ data: [] }),

          // Life Policies (Owner-Private)
          ownerClientIds.length > 0
            ? supabase
                .from('life_policies')
                .select('id, client_id')
                .in('client_id', ownerClientIds)
            : Promise.resolve({ data: [] })
        ]);

        // Process Life products if life policies exist
        let lifeProductsData: any[] = [];
        if (lifePolRes.data && lifePolRes.data.length > 0) {
          const lifePolicyMap = new Map(lifePolRes.data.map((lp: any) => [lp.id, lp.client_id]));
          const lifePolicyIds = Array.from(lifePolicyMap.keys());

          const { data: prods } = await supabase
            .from('life_policy_products')
            .select('id, life_policy_id, product_type, company, policy_number')
            .in('life_policy_id', lifePolicyIds)
            .or(`product_type.ilike.%${q}%,company.ilike.%${q}%,policy_number.ilike.%${q}%`)
            .limit(5);

          if (prods) {
            lifeProductsData = prods.map((prod: any) => ({
              ...prod,
              client_id: lifePolicyMap.get(prod.life_policy_id)
            }));
          }
        }

        // Map Clients Results
        const clientsResData = (rawClientsRes.data || []).filter((c: any) => {
          if (c.agent_id === agentId) return true;
          return Array.isArray(c.policies) && c.policies.length > 0;
        });

        const clientItems: SearchResultItem[] = clientsResData.map((c: any) => ({
          id: c.id,
          category: 'clients',
          title: c.full_name || 'Unnamed Client',
          subtitle: [c.email, c.phone, c.address].filter(Boolean).join(' • '),
          badge: c.client_type === 'company' ? 'Company Client' : 'Individual Client',
          targetUrl: `/clients/${c.id}`
        }));

        // Map Leads Results
        const leadItems: SearchResultItem[] = (leadsRes.data || []).map((l: any) => {
          const name = `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Lead';
          return {
            id: l.id,
            category: 'leads',
            title: name,
            subtitle: [l.email, l.phone, l.product_interest].filter(Boolean).join(' • '),
            badge: l.status || 'Lead',
            targetUrl: `/leads/${l.id}`
          };
        });

        // Map Companies Results
        const companiesResData = (rawCompaniesRes.data || []).filter((c: any) => {
          if (c.agent_id === agentId) return true;
          return Array.isArray(c.policies) && c.policies.length > 0;
        });

        const companyItems: SearchResultItem[] = companiesResData.map((c: any) => ({
          id: c.id,
          category: 'companies',
          title: c.full_name || 'Company Profile',
          subtitle: `Contact: ${c.full_name} ${c.email ? '• ' + c.email : ''}`,
          badge: 'Commercial Profile',
          targetUrl: `/clients/${c.id}`
        }));

        // Map P&C Policies Results
        const pcItems: SearchResultItem[] = (pcRes.data || []).map((p: any) => {
          const clientName = clientMap.get(p.client_id) || 'Client';
          return {
            id: p.id,
            category: 'pc',
            title: `P&C: ${p.policy_type || 'Policy'} ${p.policy_number ? '#' + p.policy_number : ''}`,
            subtitle: `Insured: ${clientName} • Carrier: ${p.writing_company || p.company_name || 'Unspecified'}`,
            badge: 'P&C',
            targetUrl: `/clients/${p.client_id}?tab=policies`
          };
        });

        // Map Health Policies Results
        const healthItems: SearchResultItem[] = (healthRes.data || []).map((h: any) => {
          const clientName = clientMap.get(h.client_id) || 'Client';
          return {
            id: h.id,
            category: 'health',
            title: `Health: ${h.plan_name || h.company_2026 || 'Health Policy'}`,
            subtitle: `Client: ${clientName} • Carrier: ${h.company_2026 || 'Unspecified'} ${h.renovation_status ? '• ' + h.renovation_status : ''}`,
            badge: 'Health',
            targetUrl: `/clients/${h.client_id}?tab=health`
          };
        });

        // Map Life Policies Results
        const lifeItems: SearchResultItem[] = lifeProductsData.map((l: any) => {
          const clientName = clientMap.get(l.client_id) || 'Client';
          return {
            id: l.id,
            category: 'life',
            title: `Life: ${l.product_type || 'Life Policy'} ${l.policy_number ? '#' + l.policy_number : ''}`,
            subtitle: `Client: ${clientName} • Company: ${l.company || 'Unspecified'}`,
            badge: 'Life',
            targetUrl: `/clients/${l.client_id}?tab=life`
          };
        });

        setResults({
          clients: clientItems,
          leads: leadItems,
          pc: pcItems,
          health: healthItems,
          life: lifeItems,
          companies: companyItems
        });
      } catch (err) {
        console.error('Error executing agent global search:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectResult = (url: string) => {
    setIsOpen(false);
    setQuery('');
    router.push(url);
  };

  const totalResults =
    results.clients.length +
    results.leads.length +
    results.pc.length +
    results.health.length +
    results.life.length +
    results.companies.length;

  return (
    <div ref={searchContainerRef} className="w-80 relative">
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7C8799]">
          {loading ? (
            <svg className="animate-spin w-4 h-4 text-[#2563EB]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          placeholder="Search clients, policies, leads..."
          className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#172033] placeholder-[#7C8799] outline-none transition-all"
        />
      </div>

      {/* Results Dropdown Overlay */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[80vh] overflow-y-auto font-sans">
          {loading && totalResults === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">Searching your CRM records...</div>
          ) : totalResults === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No matching records found for &quot;<span className="font-semibold text-slate-600">{query}</span>&quot;
            </div>
          ) : (
            <div className="py-2 divide-y divide-slate-100">
              {/* Clients Group */}
              {results.clients.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    Clients ({results.clients.length})
                  </div>
                  {results.clients.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectResult(item.targetUrl)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50/60 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                        {item.badge}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Leads Group */}
              {results.leads.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    Leads ({results.leads.length})
                  </div>
                  {results.leads.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectResult(item.targetUrl)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50/60 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                        {item.badge}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* P&C Group */}
              {results.pc.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    P&C Policies ({results.pc.length})
                  </div>
                  {results.pc.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectResult(item.targetUrl)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50/60 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                        P&C
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Health Group */}
              {results.health.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    Health Policies ({results.health.length})
                  </div>
                  {results.health.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectResult(item.targetUrl)}
                      className="w-full px-3 py-2 text-left hover:bg-emerald-50/60 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-600 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                        Health
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Life Group */}
              {results.life.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    Life Policies ({results.life.length})
                  </div>
                  {results.life.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectResult(item.targetUrl)}
                      className="w-full px-3 py-2 text-left hover:bg-purple-50/60 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-purple-600 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                        Life
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Companies Group */}
              {results.companies.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    Companies ({results.companies.length})
                  </div>
                  {results.companies.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectResult(item.targetUrl)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50/60 transition-colors flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                        Company
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
