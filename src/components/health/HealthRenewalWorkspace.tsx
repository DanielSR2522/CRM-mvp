'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HealthPolicy } from '@/lib/health/types';
import { supabase } from '@/lib/supabaseClient';

// Workflow Pipeline Statuses (Local Memory State)
export type RenewalWorkflowStatus =
  | 'Not Contacted'
  | 'Bot Sent'
  | 'Conversation In Progress'
  | 'Responded'
  | 'Information Complete'
  | 'Ready for Renewal'
  | 'Renewal In Progress'
  | 'Renewed'
  | 'Action Required'
  | 'Complete';

export type BotStatus = 'Not Sent' | 'Sent' | 'In Conversation' | 'Completed';
export type RenewalReadiness = 'Missing Info' | 'Review Needed' | 'Ready';
export type PendingActionType =
  | 'Documents'
  | 'Payment'
  | 'Consent'
  | 'Verification'
  | 'Carrier Confirmation'
  | 'ID Cards'
  | 'None';

export interface DevSessionData {
  client_id: string;
  client_name: string;
  agent_name: string;
  phone: string;
  language: string;
  status: string;
  answers: Record<string, any>;
  confirmed_fields: Record<string, boolean>;
  completed_topics: string[];
  missing_topics: string[];
  needs_agent_review: boolean;
  bot_status: 'not_sent' | 'sent' | 'in_conversation' | 'completed';
  readiness: 'missing_info' | 'review_needed' | 'ready';
  started_at: string;
  last_activity_at: string;
  messages: Array<{
    id: string;
    sender: 'bot' | 'client';
    text: string;
    timestamp: string;
  }>;
}

export interface RenewalClientRow {
  id: string; // Policy ID
  clientId: string; // Client ID
  clientName: string;
  phone: string;
  email: string;
  agentName: string;
  company: string;
  planName: string;
  effectiveDate: string;
  expirationDate: string;
  planCost: number;
  taxCredit: number;

  // Real Health Medical / Income Info
  householdIncome: string;
  medications: string;
  doctors: string;
  specialists: string;
  address: string;

  // Operational Workflow States (Synced from Local Lanza Session or React Memory)
  lastBotActivity: string;
  botStatus: BotStatus;
  renewalReadiness: RenewalReadiness;
  renewalStatus: RenewalWorkflowStatus;
  pendingAction: PendingActionType;

  // Live Local Bot Session Payload
  localSession?: DevSessionData;

  // Questionnaire Responses
  responses: {
    renewalIntent: string;
    householdIncome: string;
    householdChanges: string;
    address: string;
    employmentStatus: string;
    employerCoverage: string;
    medications: string;
    doctorsSpecialists: string;
    healthChanges: string;
    planPreference: string;
    additionalNotes: string;
  };

  // WhatsApp Conversation Transcript
  chatHistory: Array<{
    id: string;
    sender: 'bot' | 'client';
    text: string;
    timestamp: string;
  }>;
}

interface HealthRenewalWorkspaceProps {
  healthPolicy: HealthPolicy | null;
  clientId: string;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
  onPolicyUpdated?: (updatedPolicy: HealthPolicy) => void;
  onReturnToSummary?: () => void;
}

export default function HealthRenewalWorkspace({
  healthPolicy,
  clientId,
  addToast,
  onReturnToSummary,
}: HealthRenewalWorkspaceProps) {
  // Real Health Client Rows State (Loaded in Read-Only Mode)
  const [clients, setClients] = useState<RenewalClientRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadedCount, setLoadedCount] = useState<number>(0);

  // Dev Session Map from Local Lanza Bridge
  const [devSessions, setDevSessions] = useState<Record<string, DevSessionData>>({});

  // Selected Active Tab Quick Filter
  const [activeTab, setActiveTab] = useState<string>('All Clients');

  // Filter Toolbar States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [renewalStatusFilter, setRenewalStatusFilter] = useState<string>('ALL');
  const [botStatusFilter, setBotStatusFilter] = useState<string>('ALL');
  const [pendingActionFilter, setPendingActionFilter] = useState<string>('ALL');

  // Client Detail Right Drawer State
  const [selectedClient, setSelectedClient] = useState<RenewalClientRow | null>(null);

  // WhatsApp Full Chat Modal State
  const [chatClient, setChatClient] = useState<RenewalClientRow | null>(null);

  // 1. Fetch Local Bridge Dev Sessions from /api/dev/renewals/sessions
  const fetchDevSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/dev/renewals/sessions');
      if (res.ok) {
        const data = await res.json();
        const sessionMap: Record<string, DevSessionData> = {};
        (data.sessions || []).forEach((s: DevSessionData) => {
          if (s.client_id) {
            sessionMap[s.client_id] = s;
          }
        });
        setDevSessions(sessionMap);
      }
    } catch (err) {
      // Non-blocking catch
    }
  }, []);

  useEffect(() => {
    fetchDevSessions();
    const interval = setInterval(fetchDevSessions, 3000);
    return () => clearInterval(interval);
  }, [fetchDevSessions]);

  // 2. Load Real Health Data from Winterfell DB in READ-ONLY mode
  const loadRealHealthClients = useCallback(async () => {
    try {
      setLoading(true);

      const { data: rawPolicies, error: hpError } = await supabase
        .from('health_policies')
        .select('*')
        .order('created_at', { ascending: false });

      if (hpError) {
        console.error('[Health Renewal Workspace] Error fetching health policies:', hpError);
      }

      const policies = (rawPolicies as HealthPolicy[]) || [];
      const clientIds = Array.from(new Set(policies.map((p) => p.client_id).filter(Boolean)));

      let clientMap: Record<string, { full_name: string; phone: string | null; email: string | null; agent_id: string | null; address: string | null }> = {};
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, full_name, phone, email, agent_id, address')
          .in('id', clientIds);

        if (clientsData) {
          clientsData.forEach((c: any) => {
            clientMap[c.id] = {
              full_name: c.full_name || 'Unnamed Client',
              phone: c.phone || null,
              email: c.email || null,
              agent_id: c.agent_id || null,
              address: c.address || null,
            };
          });
        }
      }

      const agentIds = Array.from(
        new Set(Object.values(clientMap).map((c) => c.agent_id).filter((id): id is string => Boolean(id)))
      );
      let profileMap: Record<string, string> = {};
      if (agentIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name, first_name, last_name, email')
          .in('id', agentIds);

        if (profilesData) {
          profilesData.forEach((p: any) => {
            const fullName = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Assigned Agent';
            profileMap[p.id] = fullName;
          });
        }
      }

      let incomeMap: Record<string, number> = {};
      if (clientIds.length > 0) {
        const { data: incomeData } = await supabase
          .from('client_income_information')
          .select('client_id, income')
          .in('client_id', clientIds);

        if (incomeData) {
          incomeData.forEach((row: any) => {
            if (row.client_id && row.income !== null && row.income !== undefined) {
              const val = Number(row.income);
              if (!isNaN(val) && val > 0) {
                incomeMap[row.client_id] = (incomeMap[row.client_id] || 0) + val;
              }
            }
          });
        }
      }

      const policyByClient: Record<string, HealthPolicy> = {};
      policies.forEach((p) => {
        const existing = policyByClient[p.client_id];
        if (!existing || (!existing.active && p.active)) {
          policyByClient[p.client_id] = p;
        }
      });

      const deduplicatedPolicies = Object.values(policyByClient);

      const realRows: RenewalClientRow[] = deduplicatedPolicies.map((p) => {
        const c = clientMap[p.client_id] || {
          full_name: 'Client ' + p.client_id.slice(0, 8),
          phone: null,
          email: null,
          agent_id: null,
          address: null,
        };

        const agentName = c.agent_id ? profileMap[c.agent_id] || 'Loni Oliveira De Souza' : 'Loni Oliveira De Souza';
        const incomeVal = incomeMap[p.client_id];
        const incomeFormatted = incomeVal ? `$${incomeVal.toLocaleString()} / ano` : 'Not collected yet';

        const realMeds = p.medicines || 'Not collected yet';
        const realDocs = p.primary_doctor || 'Not collected yet';
        const realSpecs = p.specialist || 'Not collected yet';
        const realAddress = c.address || 'Not collected yet';

        // Check for local dev bot session
        const devSession = devSessions[p.client_id];

        let botStatus: BotStatus = 'Not Sent';
        let readiness: RenewalReadiness = 'Missing Info';
        let workflowStatus: RenewalWorkflowStatus = 'Not Contacted';
        let chatHistory: Array<{ id: string; sender: 'bot' | 'client'; text: string; timestamp: string }> = [];
        let lastBotActivity = p.active ? 'Active Policy' : 'Pending Review';

        if (devSession) {
          botStatus =
            devSession.bot_status === 'completed'
              ? 'Completed'
              : devSession.bot_status === 'in_conversation'
              ? 'In Conversation'
              : devSession.bot_status === 'sent'
              ? 'Sent'
              : 'Not Sent';

          readiness =
            devSession.readiness === 'ready'
              ? 'Ready'
              : devSession.readiness === 'review_needed'
              ? 'Review Needed'
              : 'Missing Info';

          workflowStatus =
            readiness === 'Ready'
              ? 'Ready for Renewal'
              : devSession.bot_status === 'in_conversation'
              ? 'Conversation In Progress'
              : 'Not Contacted';

          chatHistory = devSession.messages || [];
          lastBotActivity = devSession.last_activity_at
            ? new Date(devSession.last_activity_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Active Session';
        } else {
          readiness = p.company_2026 && p.plan_name ? 'Ready' : p.company_2026 ? 'Review Needed' : 'Missing Info';
          workflowStatus = p.renovation_status === 'Renewal 2026' ? 'Ready for Renewal' : p.active ? 'Ready for Renewal' : 'Not Contacted';
        }

        const pendingAction: PendingActionType =
          p.action_pending === 'Documents'
            ? 'Documents'
            : p.action_pending === 'Verification'
            ? 'Verification'
            : p.action_pending === 'Call To Marketplace'
            ? 'Carrier Confirmation'
            : 'None';

        const answers = devSession?.answers || {};

        return {
          id: p.id,
          clientId: p.client_id,
          clientName: c.full_name,
          phone: c.phone || '—',
          email: c.email || '—',
          agentName,
          company: p.company_2026 || 'Health Carrier Unassigned',
          planName: p.plan_name || 'ACA Health Plan',
          effectiveDate: p.effective_date || '2025-01-01',
          expirationDate: '2025-12-31',
          planCost: p.plan_cost || 0,
          taxCredit: p.tax_credit || 0,

          householdIncome: answers.household_income ? `$${answers.household_income} / ano` : incomeFormatted,
          medications: answers.medications || realMeds,
          doctors: answers.doctors_specialists || realDocs,
          specialists: realSpecs,
          address: answers.address_change || realAddress,

          lastBotActivity,
          botStatus,
          renewalReadiness: readiness,
          renewalStatus: workflowStatus,
          pendingAction,

          localSession: devSession,

          responses: {
            renewalIntent: answers.renewal_intent || (p.active ? 'Ativa (Deseja renovar para 2026)' : 'Not collected yet'),
            householdIncome: answers.household_income ? `$${answers.household_income} / ano` : incomeFormatted,
            householdChanges: answers.household_changes || 'Not collected yet',
            address: answers.address_change || realAddress,
            employmentStatus: answers.employment_status || 'Not collected yet',
            employerCoverage: answers.employer_coverage || 'Not collected yet',
            medications: answers.medications || realMeds,
            doctorsSpecialists: answers.doctors_specialists || [realDocs, realSpecs].filter((x) => x !== 'Not collected yet').join(', ') || 'Not collected yet',
            healthChanges: answers.health_changes || 'Not collected yet',
            planPreference: answers.plan_preference || (p.company_2026 ? `Manter ${p.company_2026} ou equivalente` : 'Not collected yet'),
            additionalNotes: answers.additional_notes || `Dados da apólice real de Saúde (${p.company_2026 || 'Pendente'}).`,
          },

          chatHistory,
        };
      });

      setClients(realRows);
      setLoadedCount(realRows.length);
    } catch (err) {
      console.error('[Health Renewal Workspace] Error loading real health data:', err);
      setClients([]);
      setLoadedCount(0);
    } finally {
      setLoading(false);
    }
  }, [devSessions]);

  useEffect(() => {
    loadRealHealthClients();
  }, [loadRealHealthClients]);

  // Derived Filtered Clients
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      // 1. Quick Tab Filter
      if (activeTab !== 'All Clients') {
        if (activeTab === 'Not Contacted' && c.renewalStatus !== 'Not Contacted') return false;
        if (activeTab === 'Bot Sent' && c.renewalStatus !== 'Bot Sent') return false;
        if (activeTab === 'In Conversation' && c.renewalStatus !== 'Conversation In Progress') return false;
        if (activeTab === 'Responded' && c.renewalStatus !== 'Responded') return false;
        if (activeTab === 'Ready for Renewal' && c.renewalStatus !== 'Ready for Renewal') return false;
        if (activeTab === 'In Renewal' && c.renewalStatus !== 'Renewal In Progress') return false;
        if (activeTab === 'Renewed' && c.renewalStatus !== 'Renewed') return false;
        if (activeTab === 'Action Required' && c.renewalStatus !== 'Action Required') return false;
        if (activeTab === 'Complete' && c.renewalStatus !== 'Complete') return false;
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = c.clientName.toLowerCase().includes(q);
        const matchPhone = c.phone.toLowerCase().includes(q);
        const matchEmail = c.email.toLowerCase().includes(q);
        const matchCompany = c.company.toLowerCase().includes(q);
        const matchPlan = c.planName.toLowerCase().includes(q);
        const matchAgent = c.agentName.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchEmail && !matchCompany && !matchPlan && !matchAgent) {
          return false;
        }
      }

      // 3. Dropdown Filters
      if (agentFilter !== 'ALL' && c.agentName !== agentFilter) return false;
      if (companyFilter !== 'ALL' && c.company !== companyFilter) return false;
      if (renewalStatusFilter !== 'ALL' && c.renewalStatus !== renewalStatusFilter) return false;
      if (botStatusFilter !== 'ALL' && c.botStatus !== botStatusFilter) return false;
      if (pendingActionFilter !== 'ALL' && c.pendingAction !== pendingActionFilter) return false;

      return true;
    });
  }, [
    clients,
    activeTab,
    searchQuery,
    agentFilter,
    companyFilter,
    renewalStatusFilter,
    botStatusFilter,
    pendingActionFilter,
  ]);

  // Top KPI Card Metrics
  const stats = useMemo(() => {
    const total = clients.length;
    const notContacted = clients.filter((c) => c.renewalStatus === 'Not Contacted').length;
    const botSent = clients.filter((c) => c.renewalStatus === 'Bot Sent').length;
    const responded = clients.filter(
      (c) => c.renewalStatus === 'Responded' || c.renewalStatus === 'Information Complete'
    ).length;
    const readyForRenewal = clients.filter((c) => c.renewalStatus === 'Ready for Renewal').length;
    const inRenewal = clients.filter((c) => c.renewalStatus === 'Renewal In Progress').length;
    const renewed = clients.filter((c) => c.renewalStatus === 'Renewed' || c.renewalStatus === 'Complete').length;
    const actionRequired = clients.filter((c) => c.renewalStatus === 'Action Required').length;

    return {
      total,
      notContacted,
      botSent,
      responded,
      readyForRenewal,
      inRenewal,
      renewed,
      actionRequired,
    };
  }, [clients]);

  // Unique Agent & Carrier Lists for Filters
  const agentOptions = useMemo(() => Array.from(new Set(clients.map((c) => c.agentName))), [clients]);
  const companyOptions = useMemo(() => Array.from(new Set(clients.map((c) => c.company))), [clients]);

  // Clear All Filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setAgentFilter('ALL');
    setCompanyFilter('ALL');
    setRenewalStatusFilter('ALL');
    setBotStatusFilter('ALL');
    setPendingActionFilter('ALL');
    setActiveTab('All Clients');
  };

  // LOCAL ONLY: Start Renewal Handler (NO SUPABASE WRITE)
  const handleStartRenewal = (targetClient: RenewalClientRow) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id === targetClient.id) {
          return {
            ...c,
            renewalStatus: 'Renewal In Progress',
            renewalReadiness: 'Ready',
          };
        }
        return c;
      })
    );

    if (selectedClient && selectedClient.id === targetClient.id) {
      setSelectedClient((prev) =>
        prev
          ? {
              ...prev,
              renewalStatus: 'Renewal In Progress',
              renewalReadiness: 'Ready',
            }
          : null
      );
    }

    addToast({
      title: 'Renewal In Progress',
      description: `Updated status for ${targetClient.clientName} to "Renewal In Progress" locally.`,
      type: 'success',
    });
  };

  // LOCAL ONLY: Mark as Renewed Handler (NO SUPABASE WRITE)
  const handleMarkAsRenewed = (targetClient: RenewalClientRow) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id === targetClient.id) {
          return {
            ...c,
            renewalStatus: 'Renewed',
            renewalReadiness: 'Ready',
          };
        }
        return c;
      })
    );

    if (selectedClient && selectedClient.id === targetClient.id) {
      setSelectedClient((prev) =>
        prev
          ? {
              ...prev,
              renewalStatus: 'Renewed',
              renewalReadiness: 'Ready',
            }
          : null
      );
    }

    addToast({
      title: 'Policy Renewed',
      description: `Marked policy for ${targetClient.clientName} as "Renewed" locally.`,
      type: 'success',
    });
  };

  // LOCAL ONLY: Update Pending Action Handler (NO SUPABASE WRITE)
  const handleUpdatePendingAction = (targetClient: RenewalClientRow, nextAction: PendingActionType) => {
    const nextStatus: RenewalWorkflowStatus =
      nextAction === 'None' && (targetClient.renewalStatus === 'Renewed' || targetClient.renewalStatus === 'Complete')
        ? 'Complete'
        : targetClient.renewalStatus;

    setClients((prev) =>
      prev.map((c) => {
        if (c.id === targetClient.id) {
          return {
            ...c,
            pendingAction: nextAction,
            renewalStatus: nextStatus,
          };
        }
        return c;
      })
    );

    if (selectedClient && selectedClient.id === targetClient.id) {
      setSelectedClient((prev) =>
        prev
          ? {
              ...prev,
              pendingAction: nextAction,
              renewalStatus: nextStatus,
            }
          : null
      );
    }

    addToast({
      title: 'Pending Action Updated',
      description: `Updated pending action to "${nextAction}" locally.`,
      type: 'success',
    });
  };

  return (
    <div className="space-y-6 font-sans bg-white pb-12">
      
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔄</span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              2026 Health Renewal Operational Workspace
            </h2>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold rounded-md uppercase tracking-wider">
              LANZA LOCAL BOT BRIDGE ({loadedCount} Clients)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Real Winterfell Health clients and policy records connected via Local HTTP Bridge to Lanza del Sol Renewal Assistant (pt-BR pilot for Loni).
          </p>
        </div>

        {onReturnToSummary && (
          <button
            type="button"
            onClick={onReturnToSummary}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer self-start sm:self-auto"
          >
            ← Back to Policy Summary
          </button>
        )}
      </div>

      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Clients</span>
          <div className="text-xl font-black text-slate-900 mt-1">{stats.total}</div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Not Contacted</span>
          <div className="text-xl font-black text-slate-700 mt-1">{stats.notContacted}</div>
        </div>

        <div className="p-3.5 bg-sky-50/70 border border-sky-200/70 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">Bot Sent</span>
          <div className="text-xl font-black text-sky-900 mt-1">{stats.botSent}</div>
        </div>

        <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/70 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">Responded</span>
          <div className="text-xl font-black text-indigo-900 mt-1">{stats.responded}</div>
        </div>

        <div className="p-3.5 bg-blue-50/70 border border-blue-200/70 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">Ready Renewal</span>
          <div className="text-xl font-black text-blue-900 mt-1">{stats.readyForRenewal}</div>
        </div>

        <div className="p-3.5 bg-amber-50/70 border border-amber-200/70 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">In Renewal</span>
          <div className="text-xl font-black text-amber-900 mt-1">{stats.inRenewal}</div>
        </div>

        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Renewed</span>
          <div className="text-xl font-black text-emerald-900 mt-1">{stats.renewed}</div>
        </div>

        <div className="p-3.5 bg-rose-50/70 border border-rose-200/70 rounded-2xl">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">Action Required</span>
          <div className="text-xl font-black text-rose-900 mt-1">{stats.actionRequired}</div>
        </div>
      </div>

      {/* Quick Status Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          'All Clients',
          'Not Contacted',
          'Bot Sent',
          'In Conversation',
          'Responded',
          'Ready for Renewal',
          'In Renewal',
          'Renewed',
          'Action Required',
          'Complete',
        ].map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 items-center">
          
          {/* Search Input */}
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Search real client, phone, carrier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium"
            />
          </div>

          {/* Agent Filter */}
          <div>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">All Agents</option>
              {agentOptions.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>

          {/* Company Filter */}
          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">All Companies</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          {/* Renewal Status Filter */}
          <div>
            <select
              value={renewalStatusFilter}
              onChange={(e) => setRenewalStatusFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">All Renewal Statuses</option>
              <option value="Not Contacted">Not Contacted</option>
              <option value="Bot Sent">Bot Sent</option>
              <option value="Conversation In Progress">In Conversation</option>
              <option value="Responded">Responded</option>
              <option value="Information Complete">Information Complete</option>
              <option value="Ready for Renewal">Ready for Renewal</option>
              <option value="Renewal In Progress">Renewal In Progress</option>
              <option value="Renewed">Renewed</option>
              <option value="Action Required">Action Required</option>
              <option value="Complete">Complete</option>
            </select>
          </div>

          {/* Bot Status Filter */}
          <div>
            <select
              value={botStatusFilter}
              onChange={(e) => setBotStatusFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">All Bot Statuses</option>
              <option value="Not Sent">Not Sent</option>
              <option value="Sent">Sent</option>
              <option value="In Conversation">In Conversation</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div>
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main Renewal Operational Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs font-semibold animate-pulse">
            Loading real Winterfell Health client data & local bot sessions...
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-semibold">
            No real Health clients match the selected filters.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5">Real Client</th>
                <th className="p-3.5">Assigned Agent</th>
                <th className="p-3.5">Current Plan / Company</th>
                <th className="p-3.5">Last Bot Activity</th>
                <th className="p-3.5">Bot Status</th>
                <th className="p-3.5">Readiness</th>
                <th className="p-3.5">Renewal Status</th>
                <th className="p-3.5">Pending Action</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.map((clientRow) => (
                <tr
                  key={clientRow.id}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedClient(clientRow)}
                >
                  {/* Real Client Info */}
                  <td className="p-3.5">
                    <div className="font-extrabold text-slate-900">{clientRow.clientName}</div>
                    <div className="text-[11px] text-slate-500 font-medium">{clientRow.phone}</div>
                  </td>

                  {/* Real Assigned Agent */}
                  <td className="p-3.5 font-bold text-slate-700">
                    {clientRow.agentName}
                  </td>

                  {/* Real Plan / Company */}
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900">{clientRow.company}</div>
                    <div className="text-[11px] text-slate-500 font-medium truncate max-w-[170px]" title={clientRow.planName}>
                      {clientRow.planName}
                    </div>
                  </td>

                  {/* Last Bot Activity */}
                  <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">
                    {clientRow.lastBotActivity}
                  </td>

                  {/* Bot Status Badge */}
                  <td className="p-3.5 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                        clientRow.botStatus === 'Completed'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : clientRow.botStatus === 'In Conversation'
                          ? 'bg-sky-50 border-sky-200 text-sky-800'
                          : clientRow.botStatus === 'Sent'
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      {clientRow.botStatus}
                    </span>
                  </td>

                  {/* Renewal Readiness Badge */}
                  <td className="p-3.5 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                        clientRow.renewalReadiness === 'Ready'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : clientRow.renewalReadiness === 'Review Needed'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {clientRow.renewalReadiness}
                    </span>
                  </td>

                  {/* Renewal Status Badge */}
                  <td className="p-3.5 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                        clientRow.renewalStatus === 'Renewed' || clientRow.renewalStatus === 'Complete'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : clientRow.renewalStatus === 'Renewal In Progress'
                          ? 'bg-amber-50 border-amber-200 text-amber-800 font-extrabold'
                          : clientRow.renewalStatus === 'Ready for Renewal'
                          ? 'bg-blue-50 border-blue-200 text-blue-800'
                          : clientRow.renewalStatus === 'Action Required'
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {clientRow.renewalStatus}
                    </span>
                  </td>

                  {/* Pending Action Badge */}
                  <td className="p-3.5 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        clientRow.pendingAction === 'None'
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      {clientRow.pendingAction}
                    </span>
                  </td>

                  {/* Actions Column */}
                  <td className="p-3.5 text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setChatClient(clientRow)}
                      className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[11px] rounded-lg transition-all cursor-pointer"
                    >
                      💬 View Full Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedClient(clientRow)}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] rounded-lg transition-all cursor-pointer"
                    >
                      View Drawer →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CLIENT DETAIL RIGHT DRAWER (REAL DATA + LIVE LOCAL BOT SESSION) */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs font-sans">
          <div className="w-full sm:w-[540px] md:w-[620px] bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-slide-in-right">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                    Real Client Health Renewal Detail
                  </span>
                  {selectedClient.renewalReadiness === 'Ready' && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black rounded-md">
                      READY FOR RENEWAL ✅
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">{selectedClient.clientName}</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedClient.phone} • {selectedClient.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Section 1: Real Client Quick Info & Profile Route Navigation */}
              <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Carrier: <span className="font-extrabold text-blue-600">{selectedClient.company}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">Assigned Agent: {selectedClient.agentName}</div>
                </div>
                <a
                  href={`/clients/${selectedClient.clientId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs"
                >
                  View Profile ↗
                </a>
              </div>

              {/* Section 2: Renewal Visual Progress Stepper */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Renewal Progress Pipeline
                </h4>
                <div className="grid grid-cols-6 gap-1 text-center">
                  {[
                    { label: 'Client Response', key: 'Client Response' },
                    { label: 'Info Complete', key: 'Info Complete' },
                    { label: 'Ready Renewal', key: 'Ready for Renewal' },
                    { label: 'In Progress', key: 'Renewal In Progress' },
                    { label: 'Renewed', key: 'Renewed' },
                    { label: 'Complete', key: 'Complete' },
                  ].map((step, idx) => {
                    const isCurrent =
                      selectedClient.renewalStatus === step.key ||
                      (step.key === 'Client Response' && selectedClient.renewalStatus === 'Responded') ||
                      (step.key === 'Info Complete' && selectedClient.renewalStatus === 'Information Complete');

                    return (
                      <div key={step.key} className="space-y-1">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isCurrent
                              ? 'bg-blue-600 ring-2 ring-blue-300'
                              : idx < 3
                              ? 'bg-emerald-500'
                              : 'bg-slate-200'
                          }`}
                        />
                        <span className="block text-[9px] font-bold text-slate-600 truncate">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Live Bot Questionnaire Responses & Confirmation Badges */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                    Live Bot Questionnaire Answers
                  </h4>
                  {selectedClient.chatHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setChatClient(selectedClient)}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 underline cursor-pointer"
                    >
                      View Full Chat →
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { label: 'Renewal Intent', key: 'renewalIntent', topicKey: 'renewal_intent' },
                    { label: 'Household Income', key: 'householdIncome', topicKey: 'household_income' },
                    { label: 'Household Changes', key: 'householdChanges', topicKey: 'household_changes' },
                    { label: 'Employment Status', key: 'employmentStatus', topicKey: 'employment_status' },
                    { label: 'Address', key: 'address', topicKey: 'address_change', fullSpan: true },
                    { label: 'Employer Coverage', key: 'employerCoverage', topicKey: 'employer_coverage' },
                    { label: 'Medications', key: 'medications', topicKey: 'medications' },
                    { label: 'Doctors / Specialists', key: 'doctorsSpecialists', topicKey: 'doctors_specialists', fullSpan: true },
                    { label: 'Health Changes', key: 'healthChanges', topicKey: 'health_changes' },
                    { label: 'Plan Preference', key: 'planPreference', topicKey: 'plan_preference', fullSpan: true },
                    { label: 'Additional Notes', key: 'additionalNotes', topicKey: 'additional_notes', fullSpan: true },
                  ].map((field) => {
                    const val = (selectedClient.responses as any)[field.key] || 'Not collected yet';
                    const isConfirmed = selectedClient.localSession?.confirmed_fields?.[field.topicKey];

                    return (
                      <div
                        key={field.key}
                        className={`p-3 bg-slate-50 rounded-xl border border-slate-100 ${
                          field.fullSpan ? 'sm:col-span-2' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-extrabold text-slate-500 text-[10px] uppercase">
                            {field.label}
                          </span>
                          {val !== 'Not collected yet' && (
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${
                                isConfirmed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : selectedClient.localSession?.needs_agent_review
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isConfirmed
                                ? 'Confirmed'
                                : selectedClient.localSession?.needs_agent_review
                                ? 'Needs Review'
                                : 'Needs Confirmation'}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-slate-900">{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 4: Real Policy Plan Details */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Real Policy Details
                </h4>
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Carrier / Company:</span>
                    <span className="font-extrabold text-slate-900">{selectedClient.company}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Plan Name:</span>
                    <span className="font-bold text-slate-800">{selectedClient.planName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Effective Dates:</span>
                    <span className="font-semibold text-slate-700">
                      {selectedClient.effectiveDate} to {selectedClient.expirationDate}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-blue-100">
                    <span className="text-slate-500 font-semibold">Plan Cost / Tax Credit:</span>
                    <span className="font-extrabold text-emerald-800">
                      ${selectedClient.planCost} (Tax Credit: ${selectedClient.taxCredit})
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 5: Pending Action Selector (Local Memory State) */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Pending Actions (Local Workflow)
                </h4>
                <select
                  value={selectedClient.pendingAction}
                  onChange={(e) => handleUpdatePendingAction(selectedClient, e.target.value as PendingActionType)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 font-bold outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="None">None (No Pending Action)</option>
                  <option value="Documents">Documents</option>
                  <option value="Payment">Payment</option>
                  <option value="Consent">Consent</option>
                  <option value="Verification">Verification</option>
                  <option value="Carrier Confirmation">Carrier Confirmation</option>
                  <option value="ID Cards">ID Cards</option>
                </select>
              </div>

            </div>

            {/* Drawer Primary Action Footer (LOCAL WORKFLOW UI ONLY) */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
              {selectedClient.renewalStatus !== 'Renewal In Progress' &&
              selectedClient.renewalStatus !== 'Renewed' &&
              selectedClient.renewalStatus !== 'Complete' ? (
                <button
                  type="button"
                  onClick={() => handleStartRenewal(selectedClient)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  ⚡ START RENEWAL (LOCAL)
                </button>
              ) : selectedClient.renewalStatus === 'Renewal In Progress' ? (
                <button
                  type="button"
                  onClick={() => handleMarkAsRenewed(selectedClient)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  ✓ Mark as Renewed (LOCAL)
                </button>
              ) : (
                <div className="w-full text-center py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-xs rounded-xl">
                  ✓ Policy Status: {selectedClient.renewalStatus} (LOCAL)
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* FULL CHAT MOCK / REAL TRANSCRIPT MODAL */}
      {chatClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[560px] animate-scale-up">
            
            {/* Chat Header */}
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">💬</span>
                <div>
                  <h4 className="text-sm font-extrabold">{chatClient.clientName} — WhatsApp Renewal Transcript</h4>
                  <p className="text-[11px] text-emerald-100 font-medium">
                    Lanza del Sol Bot Automation • {chatClient.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatClient(null)}
                className="text-white/80 hover:text-white p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Conversation Bubbles */}
            <div className="flex-1 p-4 bg-[#efeae2] overflow-y-auto space-y-3">
              {chatClient.chatHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs font-semibold italic">
                  No renewal conversation has started yet.
                </div>
              ) : (
                chatClient.chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'client' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-xs font-medium shadow-xs ${
                        msg.sender === 'client'
                          ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none'
                          : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                      }`}
                    >
                      <p className="leading-relaxed">{msg.text}</p>
                      <span className="block text-[9px] text-slate-400 text-right mt-1 font-semibold">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Footer */}
            <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">
                {chatClient.chatHistory.length > 0
                  ? 'Real-time Lanza del Sol Bot Bridge Active'
                  : 'Awaiting initial bot message'}
              </span>
              <button
                type="button"
                onClick={() => setChatClient(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 rounded-xl cursor-pointer"
              >
                Close Chat
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
