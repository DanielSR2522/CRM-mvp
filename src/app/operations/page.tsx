'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { AMANDA_UUID, LAURA_UUID, getAssignedAgentDisplay } from '@/lib/auth/agentDisplay';
import {
  parseAppointmentDescription,
  formatCalendarAppointmentDisplayTitle,
} from '@/app/calendar/page';
import type { AppointmentStatus } from '@/lib/calendar/types';
import type {
  AppointmentMatchMethod,
  AppointmentsDateFilter,
  AppointmentsSortField,
  AppointmentsSourceFilter,
  AppointmentsStatusFilter,
  AppointmentsSubTab,
  InsuranceCategory,
  InsuranceCategoryFilterMode,
  OperationsAppointmentFilter,
  OperationsAppointmentItem,
  OperationsAppointmentRecord,
  OperationsAppointmentStatus,
  OperationsClientRecord,
  OperationsContactStatus,
  OperationsNextAction,
  OperationsPrimaryView,
  OperationsSortDirection,
  OperationsSortField,
  PendingReviewClassification,
  PendingReviewReasonCode,
  SuggestedCustomerCandidate,
} from '@/lib/operations/types';
import OperationsCustomerDrawer from '@/components/operations/OperationsCustomerDrawer';
import OperationsAppointmentDrawer, {
  type CrmCustomerOption,
} from '@/components/operations/OperationsAppointmentDrawer';

const AGENCY_TIMEZONE = 'America/New_York';

const PORTUGUESE_SPANISH_CONNECTORS = new Set([
  'de',
  'da',
  'do',
  'dos',
  'das',
  'del',
  'la',
  'las',
  'los',
  'e',
  'jr',
  'filho',
  'neto',
]);

function formatAgentProfileName(
  profile?: {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    email?: string | null;
  } | null
): string {
  if (!profile) return 'Agent';
  const full = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  if (full) return full;
  if (profile.name && profile.name.trim()) return profile.name.trim();
  if (profile.email && profile.email.trim()) return profile.email.split('@')[0];
  if (profile.id) return `Agent (${profile.id.slice(0, 8)})`;
  return 'Agent';
}

/**
 * Normalizes a person name for deterministic comparison:
 * - Decomposes and strips accents/diacritics
 * - Lowercases
 * - Removes punctuation (commas, periods)
 * - Trims whitespace and collapses repeated spaces
 */
export function normalizeNameForComparison(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeEmailForComparison(raw?: string | null): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

function getSignificantNameTokens(normalizedName: string): string[] {
  if (!normalizedName) return [];
  return normalizedName
    .split(' ')
    .filter((t) => t.length >= 2 && !PORTUGUESE_SPANISH_CONNECTORS.has(t));
}

function formatEasternDateKey(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: AGENCY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const yyyy = parts.find((p) => p.type === 'year')?.value || '1970';
    const mm = parts.find((p) => p.type === 'month')?.value || '01';
    const dd = parts.find((p) => p.type === 'day')?.value || '01';
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

interface RawClientRow {
  id: string;
  agent_id: string | null;
  full_name: string;
  client_type: string | null;
  agency_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

interface RawAppointmentRow {
  id: string;
  agent_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
}

const CATEGORY_BADGE_META: Record<
  InsuranceCategory,
  { label: string; shortLabel: string; className: string }
> = {
  health: {
    label: 'Health',
    shortLabel: 'Health',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  life: {
    label: 'Life',
    shortLabel: 'Life',
    className: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  medicare: {
    label: 'Medicare',
    shortLabel: 'Medicare',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  supplemental: {
    label: 'Supplemental',
    shortLabel: 'Supplemental',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  pc: {
    label: 'Property & Casualty',
    shortLabel: 'P&C',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
};

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function formatTableAppointmentDate(iso: string): {
  dateLine: string;
  timeLine: string;
  dateKey: string;
} {
  try {
    const d = new Date(iso);
    return {
      dateLine: d.toLocaleDateString('en-US', {
        timeZone: AGENCY_TIMEZONE,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      timeLine: d.toLocaleTimeString('en-US', {
        timeZone: AGENCY_TIMEZONE,
        hour: 'numeric',
        minute: '2-digit',
      }),
      dateKey: formatEasternDateKey(d),
    };
  } catch {
    return { dateLine: iso, timeLine: '', dateKey: '' };
  }
}

function formatAppointmentTimeRange(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso).toLocaleTimeString('en-US', {
      timeZone: AGENCY_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
    });
    const e = new Date(endIso).toLocaleTimeString('en-US', {
      timeZone: AGENCY_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${s} – ${e} ET`;
  } catch {
    return '';
  }
}

function OperationsCenterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth & Role Scope State
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('Agent');
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [hasMultiAgentScope, setHasMultiAgentScope] = useState<boolean>(false);
  const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string }>>([]);

  // Data Loading State
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Portfolio & Appointments State
  const [clientsPortfolio, setClientsPortfolio] = useState<OperationsClientRecord[]>([]);
  const [appointmentsList, setAppointmentsList] = useState<OperationsAppointmentRecord[]>([]);

  // In-memory snapshot ref for zero-reload instant reconciliation updates after Supabase writes
  const workspaceSnapshotRef = useRef<{
    deduplicatedClients: RawClientRow[];
    rawClientsMap: Map<string, RawClientRow>;
    allRawAppts: RawAppointmentRow[];
    directoryMap: Record<string, string>;
    healthCountMap: Map<string, number>;
    healthMetaMap: Map<
      string,
      {
        carrier: string | null;
        planName: string | null;
        renovationStatus: string | null;
        actionPending: string | null;
        active: boolean | null;
      }
    >;
    lifeCountMap: Map<string, number>;
    medicareCountMap: Map<string, number>;
    supplementalCountMap: Map<string, number>;
    pcCountMap: Map<string, number>;
    pcExpirationMap: Map<string, string>;
    latestNoteMap: Map<string, string>;
  } | null>(null);
  const heldPendingIdsRef = useRef<Set<string>>(new Set());

  // Primary View Tab State
  const [primaryView, setPrimaryView] = useState<OperationsPrimaryView>('all_clients');
  const [callsShowAll, setCallsShowAll] = useState<boolean>(false);

  // Customer Table Filters State (for All Clients / Calls / Preparation / Renewals)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<InsuranceCategoryFilterMode>('ALL');
  const [appointmentFilter, setAppointmentFilter] = useState<OperationsAppointmentFilter>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [contactStatusFilter, setContactStatusFilter] = useState<'ALL' | OperationsContactStatus>('ALL');
  const [nextActionFilter, setNextActionFilter] = useState<'ALL' | OperationsNextAction>('ALL');

  // Customer Table Sorting & Pagination State
  const [sortField, setSortField] = useState<OperationsSortField>('full_name');
  const [sortDirection, setSortDirection] = useState<OperationsSortDirection>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Appointments Workspace State (PART 2, PART 3, PART 4)
  const [apptSubTab, setApptSubTab] = useState<AppointmentsSubTab>('all');
  const [apptSearchTerm, setApptSearchTerm] = useState<string>('');
  const [apptDateFilter, setApptDateFilter] = useState<AppointmentsDateFilter>('ALL');
  const [apptCustomDate, setApptCustomDate] = useState<string>('');
  const [apptStatusFilter, setApptStatusFilter] = useState<AppointmentsStatusFilter>('ALL');
  const [apptSourceFilter, setApptSourceFilter] = useState<AppointmentsSourceFilter>('ALL');
  const [apptSortField, setApptSortField] = useState<AppointmentsSortField>('starts_at');
  const [apptSortDirection, setApptSortDirection] = useState<OperationsSortDirection>('asc');

  // Drawers State
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  // Sync optional URL view parameter safely
  useEffect(() => {
    const viewParam = searchParams.get('view') as OperationsPrimaryView | null;
    if (
      viewParam &&
      ['all_clients', 'calls', 'appointments', 'preparation', 'renewals'].includes(viewParam)
    ) {
      setPrimaryView(viewParam);
    }
    const subTabParam = searchParams.get('tab') as AppointmentsSubTab | null;
    if (
      subTabParam &&
      ['all', 'upcoming', 'completed', 'cancelled', 'pending_review'].includes(subTabParam)
    ) {
      setApptSubTab(subTabParam);
    }
  }, [searchParams]);

  const loadOperationsWorkspace = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        router.replace('/login');
        return;
      }

      setCurrentUserId(user.id);

      // 1. Resolve profile and role
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('id, role, first_name, last_name, name, email')
        .eq('id', user.id)
        .maybeSingle();

      const resolvedUserName = formatAgentProfileName(
        myProfile || { id: user.id, email: user.email }
      );
      setCurrentUserName(resolvedUserName);

      const isAdmin =
        user.id === AMANDA_UUID ||
        user.id === LAURA_UUID ||
        myProfile?.role === 'admin';
      setIsAdminUser(isAdmin);

      // 2. Check assistant relationships for multi-agent scope
      const { data: assistantLinks } = await supabase
        .from('agent_assistant_relationships')
        .select('agent_profile_id')
        .eq('assistant_profile_id', user.id);

      const assistedAgentIds = Array.from(
        new Set(
          (assistantLinks || [])
            .map((r: { agent_profile_id: string | null }) => r.agent_profile_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const canFilterMultipleAgents = isAdmin || assistedAgentIds.length > 0;
      setHasMultiAgentScope(canFilterMultipleAgents);

      // 3. Load agent profiles directory
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, email, role');

      const directoryMap: Record<string, string> = {};
      if (allProfiles) {
        for (const p of allProfiles) {
          directoryMap[p.id] = formatAgentProfileName(p);
        }
      }
      if (!directoryMap[user.id]) {
        directoryMap[user.id] = resolvedUserName;
      }

      const allowedAgentScopeIds = isAdmin
        ? null // null means full authorized agency scope
        : Array.from(new Set([user.id, ...assistedAgentIds]));

      // 4. Load all accessible clients in 1,000-row batches so no records are truncated
      const rawClientsMap = new Map<string, RawClientRow>();
      const batchSize = 1000;
      let offset = 0;
      let hasMoreClients = true;

      while (hasMoreClients) {
        let clientQuery = supabase
          .from('clients')
          .select(
            'id, agent_id, full_name, client_type, agency_name, address, email, phone, created_at, updated_at'
          )
          .order('full_name', { ascending: true })
          .range(offset, offset + batchSize - 1);

        if (allowedAgentScopeIds !== null) {
          clientQuery = clientQuery.in('agent_id', allowedAgentScopeIds);
        }

        const { data: batchData, error: batchError } = await clientQuery;
        if (batchError) {
          throw new Error(`Failed to load customer portfolio: ${batchError.message}`);
        }

        const rows = (batchData || []) as RawClientRow[];
        for (const row of rows) {
          if (row.id && !rawClientsMap.has(row.id)) {
            rawClientsMap.set(row.id, row);
          }
        }

        if (rows.length < batchSize) {
          hasMoreClients = false;
        } else {
          offset += batchSize;
        }
      }

      const deduplicatedClients = Array.from(rawClientsMap.values());
      const clientIds = deduplicatedClients.map((c) => c.id);

      // Build available agents list from directory + portfolio
      const distinctAgentIds = new Set<string>();
      if (isAdmin) {
        for (const p of allProfiles || []) {
          distinctAgentIds.add(p.id);
        }
      } else {
        for (const id of allowedAgentScopeIds || [user.id]) {
          distinctAgentIds.add(id);
        }
      }
      for (const c of deduplicatedClients) {
        if (c.agent_id) {
          distinctAgentIds.add(c.agent_id);
        }
      }

      const sortedAgentOptions = Array.from(distinctAgentIds)
        .map((id) => ({
          id,
          name: directoryMap[id] || `Agent (${id.slice(0, 8)})`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAvailableAgents(sortedAgentOptions);

      if (!canFilterMultipleAgents) {
        setAgentFilter(user.id);
      }

      // 5. Resolve insurance categories across all 5 policy tables in parallel chunks
      const healthCountMap = new Map<string, number>();
      const healthMetaMap = new Map<
        string,
        {
          carrier: string | null;
          planName: string | null;
          renovationStatus: string | null;
          actionPending: string | null;
          active: boolean | null;
        }
      >();
      const lifeCountMap = new Map<string, number>();
      const medicareCountMap = new Map<string, number>();
      const supplementalCountMap = new Map<string, number>();
      const pcCountMap = new Map<string, number>();
      const pcExpirationMap = new Map<string, string>();
      const latestNoteMap = new Map<string, string>();

      if (clientIds.length > 0) {
        const idChunks = chunkArray(clientIds, 250);

        await Promise.all([
          // Health policies
          (async () => {
            for (const chunk of idChunks) {
              const { data } = await supabase
                .from('health_policies')
                .select(
                  'id, client_id, company_2026, plan_name, renovation_status, action_pending, active'
                )
                .in('client_id', chunk);
              for (const row of data || []) {
                if (!row.client_id) continue;
                healthCountMap.set(row.client_id, (healthCountMap.get(row.client_id) || 0) + 1);
                if (!healthMetaMap.has(row.client_id)) {
                  healthMetaMap.set(row.client_id, {
                    carrier: row.company_2026 || null,
                    planName: row.plan_name || null,
                    renovationStatus: row.renovation_status || null,
                    actionPending: row.action_pending || null,
                    active: typeof row.active === 'boolean' ? row.active : null,
                  });
                }
              }
            }
          })(),
          // Life policies
          (async () => {
            for (const chunk of idChunks) {
              const { data } = await supabase
                .from('life_policies')
                .select('id, client_id')
                .in('client_id', chunk);
              for (const row of data || []) {
                if (!row.client_id) continue;
                lifeCountMap.set(row.client_id, (lifeCountMap.get(row.client_id) || 0) + 1);
              }
            }
          })(),
          // Medicare information
          (async () => {
            for (const chunk of idChunks) {
              const { data } = await supabase
                .from('medicare_information')
                .select('id, client_id')
                .in('client_id', chunk);
              for (const row of data || []) {
                if (!row.client_id) continue;
                medicareCountMap.set(
                  row.client_id,
                  (medicareCountMap.get(row.client_id) || 0) + 1
                );
              }
            }
          })(),
          // Supplemental policies
          (async () => {
            for (const chunk of idChunks) {
              const { data } = await supabase
                .from('supplemental_policies')
                .select('id, client_id')
                .in('client_id', chunk);
              for (const row of data || []) {
                if (!row.client_id) continue;
                supplementalCountMap.set(
                  row.client_id,
                  (supplementalCountMap.get(row.client_id) || 0) + 1
                );
              }
            }
          })(),
          // Property & Casualty policies
          (async () => {
            for (const chunk of idChunks) {
              const { data } = await supabase
                .from('policies')
                .select('id, client_id, expiration_date')
                .in('client_id', chunk);
              for (const row of data || []) {
                if (!row.client_id) continue;
                pcCountMap.set(row.client_id, (pcCountMap.get(row.client_id) || 0) + 1);
                if (row.expiration_date) {
                  const existingExp = pcExpirationMap.get(row.client_id);
                  if (!existingExp || row.expiration_date < existingExp) {
                    pcExpirationMap.set(row.client_id, row.expiration_date);
                  }
                }
              }
            }
          })(),
          // Verified persisted customer notes
          (async () => {
            for (const chunk of idChunks) {
              const { data } = await supabase
                .from('client_notes')
                .select('client_id, note, created_at')
                .in('client_id', chunk)
                .order('created_at', { ascending: false });
              for (const row of data || []) {
                if (row.client_id && row.note && !latestNoteMap.has(row.client_id)) {
                  latestNoteMap.set(row.client_id, row.note);
                }
              }
            }
          })(),
        ]);
      }

      // 6. Load calendar_appointments scoped to authorized agent(s)
      let appointmentsQuery = supabase
        .from('calendar_appointments')
        .select('id, agent_id, client_id, title, description, starts_at, ends_at, status')
        .order('starts_at', { ascending: true });

      if (allowedAgentScopeIds !== null) {
        appointmentsQuery = appointmentsQuery.in('agent_id', allowedAgentScopeIds);
      }

      const { data: rawAppointments, error: apptQueryErr } = await appointmentsQuery;
      if (apptQueryErr) {
        console.error('Error loading calendar_appointments in Operations Center:', apptQueryErr);
      }

      const allRawAppts = (rawAppointments || []) as RawAppointmentRow[];

      const snapshot = {
        userId: user.id,
        deduplicatedClients,
        rawClientsMap,
        allRawAppts,
        directoryMap,
        healthCountMap,
        healthMetaMap,
        lifeCountMap,
        medicareCountMap,
        supplementalCountMap,
        pcCountMap,
        pcExpirationMap,
        latestNoteMap,
      };
      workspaceSnapshotRef.current = snapshot;
      recomputeWorkspaceFromSnapshot(snapshot, heldPendingIdsRef.current);
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error loading Operations Center';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const recomputeWorkspaceFromSnapshot = useCallback(
    (
      snapshot: NonNullable<typeof workspaceSnapshotRef.current> & { userId?: string },
      heldPendingIds: Set<string>
    ) => {
      const {
        deduplicatedClients,
        rawClientsMap,
        allRawAppts,
        directoryMap,
        healthCountMap,
        healthMetaMap,
        lifeCountMap,
        medicareCountMap,
        supplementalCountMap,
        pcCountMap,
        pcExpirationMap,
        latestNoteMap,
      } = snapshot;

      const getClientCategories = (cId: string): InsuranceCategory[] => {
        const list: InsuranceCategory[] = [];
        if ((healthCountMap.get(cId) || 0) > 0) list.push('health');
        if ((lifeCountMap.get(cId) || 0) > 0) list.push('life');
        if ((medicareCountMap.get(cId) || 0) > 0) list.push('medicare');
        if ((supplementalCountMap.get(cId) || 0) > 0) list.push('supplemental');
        if ((pcCountMap.get(cId) || 0) > 0) list.push('pc');
        return list;
      };

      // Build normalized email and normalized full-name lookups per agent scope
      const emailToClientsMap = new Map<string, RawClientRow[]>();
      const exactNameToClientsMap = new Map<string, RawClientRow[]>();

      for (const client of deduplicatedClients) {
        const normEmail = normalizeEmailForComparison(client.email);
        if (normEmail) {
          const existing = emailToClientsMap.get(normEmail) || [];
          existing.push(client);
          emailToClientsMap.set(normEmail, existing);
        }

        const normName = normalizeNameForComparison(client.full_name);
        if (normName) {
          const existingName = exactNameToClientsMap.get(normName) || [];
          existingName.push(client);
          exactNameToClientsMap.set(normName, existingName);
        }
      }

      // Pre-compute parsed metadata for each appointment to detect duplicate bookings accurately
      const preParsedAppts = allRawAppts.map((appt) => {
        const parsed = parseAppointmentDescription(appt.description, appt.title);
        const strippedTitle = (appt.title || '').replace(/^\[Cancelada\]\s*/i, '').trim();
        const fallbackBooker = strippedTitle.includes(' — ')
          ? strippedTitle.split(' — ')[0].trim()
          : strippedTitle;
        const bookingName = (parsed.bookedBy || fallbackBooker || 'Appointment Invitee').trim();
        const normBookingName = normalizeNameForComparison(bookingName);
        const primaryEmail = (
          parsed.invitees[0]?.email ||
          parsed.inviteeEmail?.split(',')[0] ||
          ''
        ).trim();
        const normEmail = normalizeEmailForComparison(primaryEmail);

        return {
          appt,
          parsed,
          bookingName,
          normBookingName,
          primaryEmail: primaryEmail || null,
          normEmail,
        };
      });

      const nowMs = Date.now();
      const todayKeyInTz = formatEasternDateKey(new Date());

      const clientAppointmentsMap = new Map<string, OperationsAppointmentItem[]>();
      const reconciledAppointments: OperationsAppointmentRecord[] = [];

      for (const entry of preParsedAppts) {
        const { appt, parsed, bookingName, normBookingName, primaryEmail, normEmail } = entry;
        const startMs = new Date(appt.starts_at).getTime();

        let temporalState: 'upcoming' | 'past' | 'cancelled' | 'completed';
        if (appt.status === 'cancelled') {
          temporalState = 'cancelled';
        } else if (appt.status === 'completed') {
          temporalState = 'completed';
        } else if (startMs >= nowMs) {
          temporalState = 'upcoming';
        } else {
          temporalState = 'past';
        }

        const apptDateKey = formatEasternDateKey(appt.starts_at);
        const isTodayInTz = appt.status === 'scheduled' && apptDateKey === todayKeyInTz;
        const isCalendly = parsed.isCalendly;

        // Detect sibling appointments by the same invitee email or exact multi-word booking name
        const duplicateAppointmentIds = preParsedAppts
          .filter(
            (other) =>
              other.appt.id !== appt.id &&
              other.appt.agent_id === appt.agent_id &&
              ((normEmail && other.normEmail === normEmail) ||
                (normBookingName.split(' ').length >= 2 &&
                  other.normBookingName === normBookingName))
          )
          .map((other) => other.appt.id);

        // Scope candidate lookups to the appointment's agent (or all deduplicatedClients if unmatched)
        const emailMatches = (normEmail ? emailToClientsMap.get(normEmail) || [] : []).filter(
          (c) => !c.agent_id || c.agent_id === appt.agent_id
        );

        const bookingSignificantTokens = getSignificantNameTokens(normBookingName);
        // Never match using only a shared first name: require at least 2 name tokens for exact full-name matching
        const exactNameMatches =
          bookingSignificantTokens.length >= 2 || normBookingName.split(' ').length >= 2
            ? (exactNameToClientsMap.get(normBookingName) || []).filter(
                (c) => !c.agent_id || c.agent_id === appt.agent_id
              )
            : [];

        const isExplicitlyHeldPending = heldPendingIds.has(appt.id);

        let resolvedClient: RawClientRow | null = null;
        let matchMethod: AppointmentMatchMethod = 'pending_review';
        let matchMethodBadge = 'Pending Review';
        let isProposedPreview = false;
        let isLinked = false;
        let familyContextNote: string | null = null;

        let pendingReviewReasonCode: PendingReviewReasonCode | null = null;
        let pendingReviewReasonLabel: string | null = null;
        let pendingReviewReasonDetail: string | null = null;
        const reviewClassifications: PendingReviewClassification[] = [];
        const suggestedCandidates: SuggestedCustomerCandidate[] = [];

        // HIERARCHY STEP 1: Existing valid client_id persisted in calendar_appointments.client_id
        if (appt.client_id && rawClientsMap.has(appt.client_id)) {
          resolvedClient = rawClientsMap.get(appt.client_id) || null;
          matchMethod = 'client_id';
          matchMethodBadge = 'Linked (Client ID)';
          isLinked = true;

          if (resolvedClient) {
            const normClientName = normalizeNameForComparison(resolvedClient.full_name);
            const clientTokens = getSignificantNameTokens(normClientName);
            const firstTokenShared =
              bookingSignificantTokens.length > 0 &&
              clientTokens.length > 0 &&
              bookingSignificantTokens[0] === clientTokens[0];
            if (!firstTokenShared && normClientName !== normBookingName) {
              familyContextNote = `Booked by "${bookingName}" using email ${
                primaryEmail || 'on file'
              }, which is registered to CRM policyholder "${resolvedClient.full_name}".`;
            }
          }

          // If this appointment had a shared email, keep household candidates available for inspection
          if (emailMatches.length > 1) {
            for (const c of emailMatches) {
              const isPrimary = normalizeNameForComparison(c.full_name) === normBookingName;
              suggestedCandidates.push({
                clientId: c.id,
                fullName: c.full_name,
                email: c.email,
                phone: c.phone,
                categories: getClientCategories(c.id),
                confidence: isPrimary ? 'high' : 'medium',
                matchTypeLabel: isPrimary
                  ? 'Validated Exact Name + Shared Email'
                  : 'Shared Email Household Record',
                explanation: isPrimary
                  ? `Exact normalized full-name match ("${bookingName}" = "${c.full_name}") and matching email "${primaryEmail}".`
                  : `Shares household email "${primaryEmail}".`,
                isValidatedPrimary: isPrimary,
              });
            }
          }
        }
        // HIERARCHY STEP 2 & 3: Unique normalized email match (when emailMatches.length === 1 and not held pending)
        else if (
          !isExplicitlyHeldPending &&
          emailMatches.length === 1 &&
          parsed.matchStatus !== 'ambiguous'
        ) {
          resolvedClient = emailMatches[0];
          matchMethod = 'unique_email';
          matchMethodBadge = 'Linked (Unique Email)';
          isLinked = true;

          const normClientName = normalizeNameForComparison(resolvedClient.full_name);
          const clientTokens = getSignificantNameTokens(normClientName);
          const firstTokenShared =
            bookingSignificantTokens.length > 0 &&
            clientTokens.length > 0 &&
            bookingSignificantTokens[0] === clientTokens[0];
          if (!firstTokenShared && normClientName !== normBookingName) {
            familyContextNote = `Booked by "${bookingName}" using email ${
              primaryEmail || 'on file'
            }, which belongs to CRM policyholder "${resolvedClient.full_name}".`;
          }
        }
        // SHARED EMAIL CASE (>1 CRM records share the booking email, e.g., Marcos Strassmann & Thomas Boragina Strassmann)
        // Rule: Never automatically assign shared-email matches. Validate exact-name candidate in Pending Review.
        else if (emailMatches.length > 1 || parsed.matchStatus === 'ambiguous') {
          isLinked = false;
          matchMethod = 'pending_review';

          const exactMatchAmongShared = emailMatches.find(
            (c) => normalizeNameForComparison(c.full_name) === normBookingName
          );

          if (exactMatchAmongShared) {
            pendingReviewReasonCode = 'shared_email_exact_name_validated';
            pendingReviewReasonLabel = `Shared Email (${emailMatches.length} CRM Records) — Exact Name Validated for ${exactMatchAmongShared.full_name}`;
            pendingReviewReasonDetail = `The booking email "${primaryEmail}" is shared by ${emailMatches.length} CRM records (${emailMatches
              .map((c) => c.full_name)
              .join(' and ')}). Normalized exact full-name comparison validates that this booking is intended for "${
              exactMatchAmongShared.full_name
            }". Held in Pending Review so shared-email bookings are never auto-assigned without confirmation.`;
            matchMethodBadge = 'Pending Review (Shared Email • Exact Name Validated)';
            reviewClassifications.push('existing_customer_candidate', 'family_member_booking');

            for (const c of emailMatches) {
              const isPrimary = c.id === exactMatchAmongShared.id;
              suggestedCandidates.push({
                clientId: c.id,
                fullName: c.full_name,
                email: c.email,
                phone: c.phone,
                categories: getClientCategories(c.id),
                confidence: isPrimary ? 'high' : 'medium',
                matchTypeLabel: isPrimary
                  ? 'Validated Exact Name + Shared Email'
                  : 'Shared Email Household Record',
                explanation: isPrimary
                  ? `Exact normalized full-name match ("${bookingName}" = "${c.full_name}") and matching email "${primaryEmail}". Validated intended customer.`
                  : `Shares household email "${primaryEmail}" with ${exactMatchAmongShared.full_name}, but booking name is "${bookingName}".`,
                isValidatedPrimary: isPrimary,
              });
            }
          } else {
            pendingReviewReasonCode = 'shared_email_ambiguous';
            pendingReviewReasonLabel = `Ambiguous Shared Email (${emailMatches.length} CRM Records)`;
            pendingReviewReasonDetail = `The booking email "${primaryEmail}" is shared by multiple CRM profiles. Manual selection is required.`;
            matchMethodBadge = 'Pending Review (Shared Email)';
            reviewClassifications.push('existing_customer_candidate', 'family_member_booking');

            for (const c of emailMatches) {
              suggestedCandidates.push({
                clientId: c.id,
                fullName: c.full_name,
                email: c.email,
                phone: c.phone,
                categories: getClientCategories(c.id),
                confidence: 'medium',
                matchTypeLabel: 'Shared Email Candidate',
                explanation: `Shares booking email "${primaryEmail}".`,
              });
            }
          }
        }
        // HIERARCHY STEP 4: Unique exact normalized full-name match (unambiguous, 0 email matches, not held pending)
        // Approved cases: Deborah Turturro de Moraes -> Deborah Turturro De Moraes; Claudio Bergamaschi -> Claudio Bergamaschi
        else if (!isExplicitlyHeldPending && exactNameMatches.length === 1) {
          resolvedClient = exactNameMatches[0];
          matchMethod = 'exact_full_name';
          matchMethodBadge = 'Proposed Match: Exact Name (Preview)';
          isProposedPreview = true;
          isLinked = true;
        }
        // HIERARCHY STEP 5: Partial-name matching ONLY as a suggested candidate (Pending Review)
        else {
          isLinked = false;
          matchMethod = 'pending_review';

          // If held pending from an exact-name or unique-email match, include that candidate first
          if (exactNameMatches.length === 1) {
            const c = exactNameMatches[0];
            suggestedCandidates.push({
              clientId: c.id,
              fullName: c.full_name,
              email: c.email,
              phone: c.phone,
              categories: getClientCategories(c.id),
              confidence: 'high',
              matchTypeLabel: 'Exact Normalized Full-Name Match',
              explanation: `Exact normalized full-name match ("${bookingName}" = "${c.full_name}"). Ready to confirm.`,
              isValidatedPrimary: true,
            });
          } else if (emailMatches.length === 1) {
            const c = emailMatches[0];
            suggestedCandidates.push({
              clientId: c.id,
              fullName: c.full_name,
              email: c.email,
              phone: c.phone,
              categories: getClientCategories(c.id),
              confidence: 'high',
              matchTypeLabel: 'Unique Normalized Email Match',
              explanation: `Matches booking email "${primaryEmail}". Held in Pending Review after manual unlink.`,
              isValidatedPrimary: true,
            });
          }

          // Find partial-name and family candidates within the agent's client portfolio
          // Strict rule: NEVER match using only a shared first name!
          const agentClients = deduplicatedClients.filter(
            (c) => !c.agent_id || c.agent_id === appt.agent_id
          );

          const emailLocalPart = normEmail ? normEmail.split('@')[0] : '';
          const emailDomain = normEmail && normEmail.includes('@') ? normEmail.split('@')[1] : '';
          const GENERIC_EMAIL_DOMAINS = new Set([
            'gmail.com',
            'hotmail.com',
            'icloud.com',
            'yahoo.com',
            'yahoo.com.br',
            'outlook.com',
            'msn.com',
            'mac.com',
            'live.com',
            'aol.com',
          ]);
          const isCorporateDomain = Boolean(
            emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain)
          );

          if (bookingSignificantTokens.length >= 2) {
            const bookedFirst = bookingSignificantTokens[0];
            const bookedSurname =
              bookingSignificantTokens[bookingSignificantTokens.length - 1];

            for (const c of agentClients) {
              if (suggestedCandidates.some((sc) => sc.clientId === c.id)) continue;
              const cNorm = normalizeNameForComparison(c.full_name);
              const cTokens = getSignificantNameTokens(cNorm);
              if (cTokens.length < 2) continue;

              const cEmailNorm = normalizeEmailForComparison(c.email);
              const cEmailLocal = cEmailNorm ? cEmailNorm.split('@')[0] : '';
              const cEmailDomain =
                cEmailNorm && cEmailNorm.includes('@') ? cEmailNorm.split('@')[1] : '';

              const hasFirstAndLast =
                cTokens[0] === bookedFirst && cTokens.includes(bookedSurname);
              const sameEmailHandle =
                Boolean(emailLocalPart && cEmailLocal && emailLocalPart === cEmailLocal);
              const sameCorporateDomain =
                isCorporateDomain && cEmailDomain === emailDomain;
              const sharesLastSurname =
                cTokens[cTokens.length - 1] === bookedSurname;

              if (hasFirstAndLast && sameEmailHandle) {
                suggestedCandidates.push({
                  clientId: c.id,
                  fullName: c.full_name,
                  email: c.email,
                  phone: c.phone,
                  categories: getClientCategories(c.id),
                  confidence: 'high',
                  matchTypeLabel: 'Partial Name (First + Last) & Email Handle Match',
                  explanation: `Booking name "${bookingName}" matches first and last name of "${c.full_name}", and email handle "${emailLocalPart}" matches CRM email "${c.email}".`,
                });
              } else if (hasFirstAndLast) {
                suggestedCandidates.push({
                  clientId: c.id,
                  fullName: c.full_name,
                  email: c.email,
                  phone: c.phone,
                  categories: getClientCategories(c.id),
                  confidence: 'high',
                  matchTypeLabel: 'Partial Name Match (First + Last Name Subset)',
                  explanation: `Booking name "${bookingName}" matches first and last name of existing CRM customer "${c.full_name}" (CRM email: ${
                    c.email || 'none'
                  }).`,
                });
              } else if (sharesLastSurname && sameCorporateDomain) {
                suggestedCandidates.push({
                  clientId: c.id,
                  fullName: c.full_name,
                  email: c.email,
                  phone: c.phone,
                  categories: getClientCategories(c.id),
                  confidence: 'medium',
                  matchTypeLabel: `Shared Surname & Corporate Domain (@${emailDomain})`,
                  explanation: `Shares surname "${bookedSurname.toUpperCase()}" and corporate domain "@${emailDomain}" with existing customer "${c.full_name}". Likely a family member or household booking.`,
                });
              }
            }
          }

          // Sort suggested candidates so high confidence comes first
          const confOrder = { high: 1, medium: 2, reference: 3 };
          suggestedCandidates.sort(
            (a, b) => confOrder[a.confidence] - confOrder[b.confidence]
          );

          const hasHighPartial = suggestedCandidates.some((s) => s.confidence === 'high');
          const hasFamilyCandidate = suggestedCandidates.some((s) => s.confidence === 'medium');
          const hasDuplicates = duplicateAppointmentIds.length > 0;
          const isSingleFirstName = bookingSignificantTokens.length <= 1;

          if (hasHighPartial) {
            reviewClassifications.push('existing_customer_candidate');
            if (bookingName.toLowerCase().includes('moreira')) {
              reviewClassifications.push('family_member_booking');
            }
            pendingReviewReasonCode = 'partial_name_candidate';
            pendingReviewReasonLabel = `Partial Name Candidate: ${suggestedCandidates[0].fullName}`;
            pendingReviewReasonDetail = `Calendly booking "${bookingName}" (${
              primaryEmail || 'no email'
            }) closely matches existing CRM profile "${
              suggestedCandidates[0].fullName
            }" (${suggestedCandidates[0].email || 'no email'}) by first and last name subset. Held in Pending Review because partial-name matches are never auto-assigned.`;
            matchMethodBadge = 'Pending Review (Partial Name Candidate)';
          } else if (hasFamilyCandidate) {
            reviewClassifications.push('family_member_booking', 'potential_new_customer');
            pendingReviewReasonCode = 'family_member_candidate';
            pendingReviewReasonLabel = `Possible Family Member Booking (${suggestedCandidates[0].fullName})`;
            pendingReviewReasonDetail = `Invitee "${bookingName}" (${primaryEmail}) shares a family surname and corporate domain with existing CRM client "${suggestedCandidates[0].fullName}" (${suggestedCandidates[0].email}). Verify whether this is a household dependent or a new customer profile.`;
            matchMethodBadge = 'Pending Review (Family Candidate)';
          } else if (hasDuplicates && !isSingleFirstName) {
            reviewClassifications.push(
              'possible_duplicate_appointment',
              'potential_new_customer'
            );
            pendingReviewReasonCode = 'duplicate_booking';
            pendingReviewReasonLabel = `Possible Duplicate Appointment (${
              duplicateAppointmentIds.length + 1
            } Slots) & New Customer`;
            pendingReviewReasonDetail = `"${bookingName}" (${primaryEmail}) has ${
              duplicateAppointmentIds.length + 1
            } bookings in the schedule and no matching CRM profile. Review to confirm whether one slot is a duplicate and whether to create a new customer profile.`;
            matchMethodBadge = 'Pending Review (Duplicate Slot & New Customer)';
          } else if (isSingleFirstName) {
            reviewClassifications.push('potential_new_customer');
            if (hasDuplicates) {
              reviewClassifications.push('possible_duplicate_appointment');
            }
            pendingReviewReasonCode = 'single_first_name_only';
            pendingReviewReasonLabel = hasDuplicates
              ? 'Single First Name Only & Rescheduled/Duplicate History'
              : 'Single First Name Only — No Email Match';
            pendingReviewReasonDetail = `Invitee provided only a single name ("${bookingName}") and email "${primaryEmail}" is not registered in the CRM. Per safety rules, bookings are never matched using only a shared first name.`;
            matchMethodBadge = 'Pending Review (Single Name • New Customer)';
          } else {
            reviewClassifications.push('potential_new_customer');
            if (hasDuplicates) {
              reviewClassifications.push('possible_duplicate_appointment');
            }
            pendingReviewReasonCode = 'potential_new_customer';
            pendingReviewReasonLabel = 'No Email or Full-Name Match — Potential New Customer';
            pendingReviewReasonDetail = `Neither email "${primaryEmail}" nor full name "${bookingName}" matched an existing CRM customer record. Inspect to identify as a new prospect or link manually.`;
            matchMethodBadge = 'Pending Review (New Customer Candidate)';
          }
        }

        const resolvedClientId = resolvedClient ? resolvedClient.id : null;
        const resolvedClientName = resolvedClient ? resolvedClient.full_name : null;
        const resolvedClientEmail = resolvedClient ? resolvedClient.email : null;
        const resolvedClientPhone = resolvedClient ? resolvedClient.phone : null;
        const resolvedClientCategories = resolvedClientId
          ? getClientCategories(resolvedClientId)
          : [];

        const displayTitle = formatCalendarAppointmentDisplayTitle({
          rawTitle: appt.title,
          parsed,
          clientName: resolvedClientName,
          isCancelled: appt.status === 'cancelled',
        });

        const needsPreparation =
          temporalState === 'upcoming' &&
          appt.status === 'scheduled' &&
          (!isLinked ||
            isProposedPreview ||
            Boolean(parsed.userNotes) ||
            resolvedClientCategories.includes('health'));

        const preparationReason = !needsPreparation
          ? null
          : !isLinked
          ? 'Requires customer reconciliation before consultation'
          : isProposedPreview
          ? 'Proposed exact-name match requires confirmation & plan review'
          : parsed.userNotes
          ? 'Contains pre-meeting invitee notes / Q&A'
          : 'Upcoming Health consultation — prepare plan & renewal options';

        const fallbackAgentName = appt.agent_id
          ? directoryMap[appt.agent_id] || `Agent (${appt.agent_id.slice(0, 8)})`
          : 'Unassigned';

        const record: OperationsAppointmentRecord = {
          id: appt.id,
          agentId: appt.agent_id,
          assignedAgentName: fallbackAgentName,
          persistedClientId: appt.client_id,
          resolvedClientId,
          resolvedClientName,
          resolvedClientEmail,
          resolvedClientPhone,
          resolvedClientCategories,
          isProposedPreview,
          isLinked,
          isPendingReview: !isLinked,
          matchMethod,
          matchMethodBadge,
          rawTitle: appt.title,
          displayTitle,
          eventName: parsed.eventName || appt.title || 'Consultation',
          bookingName,
          normalizedBookingName: normBookingName,
          inviteeEmail: primaryEmail,
          normalizedInviteeEmail: normEmail,
          startsAt: appt.starts_at,
          endsAt: appt.ends_at,
          status: appt.status,
          temporalState,
          isTodayInTz,
          needsPreparation,
          preparationReason,
          source: isCalendly ? 'Calendly' : 'CRM',
          location: parsed.meetingUrl || null,
          meetingUrl: parsed.meetingUrl || null,
          cancellationReason: parsed.cancellationReason || null,
          userNotes: parsed.userNotes,
          pendingReviewReasonCode,
          pendingReviewReasonLabel,
          pendingReviewReasonDetail,
          reviewClassifications,
          suggestedCandidates,
          duplicateAppointmentIds,
          familyContextNote,
        };

        reconciledAppointments.push(record);

        if (resolvedClientId && isLinked) {
          const item: OperationsAppointmentItem = {
            id: appt.id,
            agentId: appt.agent_id,
            clientId: resolvedClientId,
            rawTitle: appt.title,
            displayTitle,
            eventName: record.eventName,
            bookedBy: bookingName,
            inviteeEmail: primaryEmail,
            startsAt: appt.starts_at,
            endsAt: appt.ends_at,
            status: appt.status,
            temporalState,
            source: record.source,
            location: record.location,
            meetingUrl: record.meetingUrl,
            cancellationReason: record.cancellationReason,
            userNotes: record.userNotes,
            matchMethod:
              matchMethod === 'exact_full_name'
                ? 'exact_full_name'
                : matchMethod === 'unique_email'
                ? 'unique_email'
                : 'client_id',
            isProposedPreview,
          };

          const existingList = clientAppointmentsMap.get(resolvedClientId) || [];
          existingList.push(item);
          clientAppointmentsMap.set(resolvedClientId, existingList);
        }
      }

      // 7. Assemble unified OperationsClientRecord portfolio (1 row per customer)
      const unifiedPortfolio: OperationsClientRecord[] = deduplicatedClients.map((client) => {
        const healthCount = healthCountMap.get(client.id) || 0;
        const lifeCount = lifeCountMap.get(client.id) || 0;
        const medicareCount = medicareCountMap.get(client.id) || 0;
        const supplementalCount = supplementalCountMap.get(client.id) || 0;
        const pcCount = pcCountMap.get(client.id) || 0;

        const hasHealth = healthCount > 0;
        const hasLife = lifeCount > 0;
        const hasMedicare = medicareCount > 0;
        const hasSupplemental = supplementalCount > 0;
        const hasPC = pcCount > 0;

        const categoriesList: InsuranceCategory[] = [];
        if (hasHealth) categoriesList.push('health');
        if (hasLife) categoriesList.push('life');
        if (hasMedicare) categoriesList.push('medicare');
        if (hasSupplemental) categoriesList.push('supplemental');
        if (hasPC) categoriesList.push('pc');

        const allClientAppts = clientAppointmentsMap.get(client.id) || [];
        const upcomingAppointments = allClientAppts
          .filter((a) => a.temporalState === 'upcoming')
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

        const pastAppointments = allClientAppts
          .filter((a) => a.temporalState === 'past')
          .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

        const completedAppointments = allClientAppts
          .filter((a) => a.temporalState === 'completed')
          .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

        const cancelledAppointments = allClientAppts
          .filter((a) => a.temporalState === 'cancelled')
          .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

        let appointmentStatus: OperationsAppointmentStatus = 'none';
        if (upcomingAppointments.length > 0) {
          appointmentStatus = 'upcoming';
        } else if (completedAppointments.length > 0) {
          appointmentStatus = 'completed';
        } else if (pastAppointments.length > 0) {
          appointmentStatus = 'past';
        } else if (cancelledAppointments.length > 0) {
          appointmentStatus = 'cancelled';
        }

        const nextAppointment =
          upcomingAppointments.length > 0 ? upcomingAppointments[0] : null;

        const healthMeta = healthMetaMap.get(client.id);
        const pcNearestExp = pcExpirationMap.get(client.id) || null;

        const fallbackAgentName = client.agent_id
          ? directoryMap[client.agent_id] || `Agent (${client.agent_id.slice(0, 8)})`
          : 'Unassigned';

        const assignedAgentName = getAssignedAgentDisplay({
          clientAgentId: client.agent_id,
          currentUserId: snapshot.userId || currentUserId || '',
          isEligiblePcClient: hasPC && !hasHealth && !hasLife && !hasMedicare && !hasSupplemental,
          fallbackName: fallbackAgentName,
        });

        return {
          id: client.id,
          agentId: client.agent_id,
          assignedAgentName,
          fullName: client.full_name || 'Unnamed Client',
          clientType: client.client_type,
          agencyName: client.agency_name,
          address: client.address,
          email: client.email,
          phone: client.phone,
          createdAt: client.created_at,
          updatedAt: client.updated_at,
          policyFlags: {
            hasHealth,
            hasLife,
            hasMedicare,
            hasSupplemental,
            hasPC,
          },
          policyCounts: {
            health: healthCount,
            life: lifeCount,
            medicare: medicareCount,
            supplemental: supplementalCount,
            pc: pcCount,
            total: healthCount + lifeCount + medicareCount + supplementalCount + pcCount,
          },
          categoriesList,
          renewalMetadata: {
            hasHealthRenewal: hasHealth,
            healthCarrier: healthMeta?.carrier || null,
            healthPlanName: healthMeta?.planName || null,
            healthRenovationStatus: healthMeta?.renovationStatus || null,
            healthActionPending: healthMeta?.actionPending || null,
            healthActive: healthMeta?.active ?? null,
            pcNearestExpiration: pcNearestExp,
          },
          appointmentStatus,
          nextAppointment,
          upcomingAppointments,
          pastAppointments,
          completedAppointments,
          cancelledAppointments,
          allAppointments: allClientAppts,
          contactStatus: 'not_recorded',
          nextAction: 'not_recorded',
          verifiedPersistedNote: latestNoteMap.get(client.id) || null,
        };
      });

      setClientsPortfolio(unifiedPortfolio);
      setAppointmentsList(reconciledAppointments);
    },
    [currentUserId]
  );

  // PHASE 2: Individual Appointment Customer Link Confirmation & Persistence in Supabase
  const handleConfirmLinkClient = useCallback(
    async (
      appointmentId: string,
      targetClientId: string
    ): Promise<{ success: boolean; error?: string }> => {
      const snapshot = workspaceSnapshotRef.current;
      if (!snapshot) {
        return { success: false, error: 'Workspace data is still loading.' };
      }

      const targetAppt = snapshot.allRawAppts.find((a) => a.id === appointmentId);
      if (!targetAppt) {
        return { success: false, error: 'Appointment record not found.' };
      }

      const targetClient = snapshot.rawClientsMap.get(targetClientId);
      if (!targetClient) {
        return {
          success: false,
          error: 'Selected customer does not exist in the CRM portfolio.',
        };
      }

      if (targetClient.agent_id && targetClient.agent_id !== targetAppt.agent_id) {
        return {
          success: false,
          error:
            'Selected customer belongs to a different agent and cannot be linked to this appointment.',
        };
      }

      try {
        const nowIso = new Date().toISOString();

        // Use direct Supabase client update when logged-in user is the appointment's owner agent
        if (currentUserId && currentUserId === targetAppt.agent_id) {
          const { data: updatedRow, error: updateErr } = await supabase
            .from('calendar_appointments')
            .update({
              client_id: targetClientId,
              updated_at: nowIso,
            })
            .eq('id', appointmentId)
            .eq('agent_id', targetAppt.agent_id)
            .select('id, agent_id, client_id, updated_at')
            .single();

          if (updateErr || !updatedRow) {
            return {
              success: false,
              error:
                updateErr?.message ||
                'Supabase rejected the appointment link update. Check permissions.',
            };
          }
        } else {
          // Admin / Assistant multi-agent scope: use server-verified endpoint reusing checkUserCalendarAuthorization
          const res = await fetch('/api/calendar/appointments/link', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appointmentId,
              clientId: targetClientId,
            }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || !payload?.success) {
            return {
              success: false,
              error:
                payload?.error ||
                `Failed to persist appointment link (HTTP ${res.status}).`,
            };
          }
        }

        // Update in-memory snapshot and recompute immediately without page reload
        heldPendingIdsRef.current.delete(appointmentId);
        const updatedSnapshot = {
          ...snapshot,
          allRawAppts: snapshot.allRawAppts.map((r) =>
            r.id === appointmentId ? { ...r, client_id: targetClientId } : r
          ),
        };
        workspaceSnapshotRef.current = updatedSnapshot;
        recomputeWorkspaceFromSnapshot(updatedSnapshot, heldPendingIdsRef.current);
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || 'Unexpected error saving appointment link to Supabase.',
        };
      }
    },
    [currentUserId, recomputeWorkspaceFromSnapshot]
  );

  // PHASE 2: Unlink Appointment or Keep in Pending Review
  const handleUnlinkAppointment = useCallback(
    async (
      appointmentId: string,
      keepPendingOnly = false
    ): Promise<{ success: boolean; error?: string }> => {
      const snapshot = workspaceSnapshotRef.current;
      if (!snapshot) {
        return { success: false, error: 'Workspace data is still loading.' };
      }

      const targetAppt = snapshot.allRawAppts.find((a) => a.id === appointmentId);
      if (!targetAppt) {
        return { success: false, error: 'Appointment record not found.' };
      }

      try {
        // Only write to Supabase if the appointment currently has a persisted client_id in DB
        if (targetAppt.client_id !== null && !keepPendingOnly) {
          const nowIso = new Date().toISOString();

          if (currentUserId && currentUserId === targetAppt.agent_id) {
            const { data: updatedRow, error: updateErr } = await supabase
              .from('calendar_appointments')
              .update({
                client_id: null,
                updated_at: nowIso,
              })
              .eq('id', appointmentId)
              .eq('agent_id', targetAppt.agent_id)
              .select('id, agent_id, client_id, updated_at')
              .single();

            if (updateErr || !updatedRow) {
              return {
                success: false,
                error:
                  updateErr?.message ||
                  'Supabase rejected unlinking the appointment. Check permissions.',
              };
            }
          } else {
            const res = await fetch('/api/calendar/appointments/link', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                appointmentId,
                clientId: null,
              }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || !payload?.success) {
              return {
                success: false,
                error:
                  payload?.error ||
                  `Failed to unlink appointment (HTTP ${res.status}).`,
              };
            }
          }
        }

        // Mark as held in Pending Review in memory and update snapshot immediately
        heldPendingIdsRef.current.add(appointmentId);
        const updatedSnapshot = {
          ...snapshot,
          allRawAppts: snapshot.allRawAppts.map((r) =>
            r.id === appointmentId ? { ...r, client_id: null } : r
          ),
        };
        workspaceSnapshotRef.current = updatedSnapshot;
        recomputeWorkspaceFromSnapshot(updatedSnapshot, heldPendingIdsRef.current);
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || 'Unexpected error updating appointment status.',
        };
      }
    },
    [currentUserId, recomputeWorkspaceFromSnapshot]
  );

  useEffect(() => {
    loadOperationsWorkspace();
  }, [loadOperationsWorkspace]);

  // Reset customer pagination when customer filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    primaryView,
    callsShowAll,
    searchTerm,
    categoryFilter,
    appointmentFilter,
    agentFilter,
    contactStatusFilter,
    nextActionFilter,
  ]);

  // Scope customer portfolio by Assigned Agent filter
  const agentScopedPortfolio = useMemo(() => {
    if (agentFilter === 'ALL') return clientsPortfolio;
    return clientsPortfolio.filter((c) => c.agentId === agentFilter);
  }, [clientsPortfolio, agentFilter]);

  // Scope appointment records by Assigned Agent filter (never excluding null client_id!)
  const agentScopedAppointments = useMemo(() => {
    if (agentFilter === 'ALL') return appointmentsList;
    return appointmentsList.filter((a) => a.agentId === agentFilter);
  }, [appointmentsList, agentFilter]);

  // Filter appointments by top-level Appointments filters (Search, Date, Source, Status)
  // so KPI cards, secondary summary, and sub-tabs update consistently with filters
  const baseFilteredAppointments = useMemo(() => {
    const normSearch = apptSearchTerm.trim().toLowerCase();
    const todayKey = formatEasternDateKey(new Date());
    const nowMs = Date.now();
    const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;

    return agentScopedAppointments.filter((appt) => {
      // Source filter
      if (apptSourceFilter !== 'ALL' && appt.source !== apptSourceFilter) {
        return false;
      }

      // Date filter
      if (apptDateFilter !== 'ALL') {
        const apptDateKey = formatEasternDateKey(appt.startsAt);
        const startMs = new Date(appt.startsAt).getTime();
        if (apptDateFilter === 'today' && apptDateKey !== todayKey) {
          return false;
        }
        if (
          apptDateFilter === 'next_7_days' &&
          !(startMs >= nowMs && startMs <= sevenDaysMs)
        ) {
          return false;
        }
        if (apptDateFilter === 'oct_2026' && !apptDateKey.startsWith('2026-10')) {
          return false;
        }
        if (apptDateFilter === 'nov_2026' && !apptDateKey.startsWith('2026-11')) {
          return false;
        }
        if (
          apptDateFilter === 'custom' &&
          apptCustomDate &&
          apptDateKey !== apptCustomDate
        ) {
          return false;
        }
      }

      // Explicit Status dropdown filter
      if (apptStatusFilter !== 'ALL') {
        if (apptStatusFilter === 'scheduled' && appt.status !== 'scheduled') return false;
        if (apptStatusFilter === 'upcoming' && appt.temporalState !== 'upcoming') return false;
        if (apptStatusFilter === 'need_preparation' && !appt.needsPreparation) return false;
        if (apptStatusFilter === 'completed' && appt.status !== 'completed') return false;
        if (apptStatusFilter === 'cancelled' && appt.status !== 'cancelled') return false;
        if (apptStatusFilter === 'pending_review' && !appt.isPendingReview) return false;
      }

      // Search by booking name, customer name, email, or candidate name
      if (normSearch) {
        const candidateNames = appt.suggestedCandidates.map((c) => c.fullName).join(' ');
        const haystack = [
          appt.bookingName,
          appt.resolvedClientName || '',
          appt.inviteeEmail || '',
          appt.resolvedClientEmail || '',
          appt.eventName,
          appt.matchMethodBadge,
          appt.pendingReviewReasonLabel || '',
          candidateNames,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [
    agentScopedAppointments,
    apptSourceFilter,
    apptDateFilter,
    apptCustomDate,
    apptStatusFilter,
    apptSearchTerm,
  ]);

  // Appointment KPIs & Secondary Reconciliation Summary (computed from baseFilteredAppointments)
  const appointmentMetrics = useMemo(() => {
    let total = 0;
    let scheduled = 0;
    let cancelled = 0;
    let completed = 0;
    let linked = 0;
    let persistedLinked = 0;
    let proposedExactNameLinked = 0;
    let pendingReview = 0;
    let todayCount = 0;
    let upcomingCount = 0;
    let needPreparationCount = 0;

    for (const a of baseFilteredAppointments) {
      total++;
      if (a.status === 'scheduled') scheduled++;
      if (a.status === 'cancelled') cancelled++;
      if (a.status === 'completed') completed++;

      if (a.isLinked) {
        linked++;
        if (a.isProposedPreview) {
          proposedExactNameLinked++;
        } else {
          persistedLinked++;
        }
      } else {
        pendingReview++;
      }

      if (a.isTodayInTz) todayCount++;
      if (a.temporalState === 'upcoming') upcomingCount++;
      if (a.needsPreparation) needPreparationCount++;
    }

    return {
      total,
      scheduled,
      cancelled,
      completed,
      linked,
      persistedLinked,
      proposedExactNameLinked,
      pendingReview,
      todayCount,
      upcomingCount,
      needPreparationCount,
    };
  }, [baseFilteredAppointments]);

  // Apply Appointments Sub-Tab + Sorting
  const visibleAppointments = useMemo(() => {
    const subTabFiltered = baseFilteredAppointments.filter((a) => {
      if (apptSubTab === 'all') return true;
      if (apptSubTab === 'upcoming') return a.temporalState === 'upcoming';
      if (apptSubTab === 'completed') return a.status === 'completed';
      if (apptSubTab === 'cancelled') return a.status === 'cancelled';
      if (apptSubTab === 'pending_review') return a.isPendingReview;
      return true;
    });

    const dir = apptSortDirection === 'asc' ? 1 : -1;
    const copy = [...subTabFiltered];

    copy.sort((a, b) => {
      if (apptSortField === 'starts_at') {
        const diff = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        if (diff !== 0) return diff * dir;
        return a.bookingName.localeCompare(b.bookingName);
      }
      if (apptSortField === 'booking_name') {
        return a.bookingName.localeCompare(b.bookingName) * dir;
      }
      if (apptSortField === 'customer_name') {
        const nameA = a.resolvedClientName || a.suggestedCandidates[0]?.fullName || 'ZZZ';
        const nameB = b.resolvedClientName || b.suggestedCandidates[0]?.fullName || 'ZZZ';
        return nameA.localeCompare(nameB) * dir;
      }
      if (apptSortField === 'status') {
        return a.status.localeCompare(b.status) * dir;
      }
      if (apptSortField === 'match_status') {
        return a.matchMethodBadge.localeCompare(b.matchMethodBadge) * dir;
      }
      if (apptSortField === 'assigned_agent') {
        return a.assignedAgentName.localeCompare(b.assignedAgentName) * dir;
      }
      return 0;
    });

    return copy;
  }, [baseFilteredAppointments, apptSubTab, apptSortField, apptSortDirection]);

  // Portfolio Summary Metrics (computed on agentScopedPortfolio for Customer views)
  const summaryStats = useMemo(() => {
    let healthClients = 0;
    let lifeClients = 0;
    let medicareClients = 0;
    let supplementalClients = 0;
    let pcClients = 0;
    let healthOnlyClients = 0;
    let lifeOnlyClients = 0;
    let healthAndLifeClients = 0;
    let upcomingApptClients = 0;
    let anyApptClients = 0;
    let renewalsClients = 0;

    for (const c of agentScopedPortfolio) {
      const { hasHealth, hasLife, hasMedicare, hasSupplemental, hasPC } = c.policyFlags;
      if (hasHealth) healthClients++;
      if (hasLife) lifeClients++;
      if (hasMedicare) medicareClients++;
      if (hasSupplemental) supplementalClients++;
      if (hasPC) pcClients++;

      if (hasHealth && !hasLife && !hasMedicare && !hasSupplemental && !hasPC) {
        healthOnlyClients++;
      }
      if (hasLife && !hasHealth && !hasMedicare && !hasSupplemental && !hasPC) {
        lifeOnlyClients++;
      }
      if (hasHealth && hasLife) {
        healthAndLifeClients++;
      }
      if (c.appointmentStatus === 'upcoming') {
        upcomingApptClients++;
      }
      if (c.allAppointments.length > 0) {
        anyApptClients++;
      }
      if (c.renewalMetadata.hasHealthRenewal || c.renewalMetadata.pcNearestExpiration) {
        renewalsClients++;
      }
    }

    return {
      totalClients: agentScopedPortfolio.length,
      healthClients,
      lifeClients,
      medicareClients,
      supplementalClients,
      pcClients,
      healthOnlyClients,
      lifeOnlyClients,
      healthAndLifeClients,
      upcomingApptClients,
      anyApptClients,
      outreachCandidates: agentScopedPortfolio.length - upcomingApptClients,
      preparationCandidates: upcomingApptClients + healthClients,
      renewalsClients,
    };
  }, [agentScopedPortfolio]);

  // Apply Primary View + Combinable Filters for Customer Portfolio Table
  const filteredPortfolio = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return agentScopedPortfolio.filter((client) => {
      if (primaryView === 'calls') {
        if (!callsShowAll && client.appointmentStatus === 'upcoming') {
          return false;
        }
      } else if (primaryView === 'preparation') {
        const needsPrep =
          client.appointmentStatus === 'upcoming' ||
          Boolean(client.renewalMetadata.healthActionPending) ||
          client.policyFlags.hasHealth;
        if (!needsPrep) {
          return false;
        }
      } else if (primaryView === 'renewals') {
        const hasRenewalScope =
          client.renewalMetadata.hasHealthRenewal ||
          Boolean(client.renewalMetadata.pcNearestExpiration);
        if (!hasRenewalScope) {
          return false;
        }
      }

      const { hasHealth, hasLife, hasMedicare, hasSupplemental, hasPC } = client.policyFlags;
      if (categoryFilter === 'health' && !hasHealth) return false;
      if (categoryFilter === 'life' && !hasLife) return false;
      if (categoryFilter === 'medicare' && !hasMedicare) return false;
      if (categoryFilter === 'supplemental' && !hasSupplemental) return false;
      if (categoryFilter === 'pc' && !hasPC) return false;
      if (
        categoryFilter === 'health_only' &&
        !(hasHealth && !hasLife && !hasMedicare && !hasSupplemental && !hasPC)
      ) {
        return false;
      }
      if (
        categoryFilter === 'life_only' &&
        !(hasLife && !hasHealth && !hasMedicare && !hasSupplemental && !hasPC)
      ) {
        return false;
      }
      if (categoryFilter === 'health_and_life' && !(hasHealth && hasLife)) {
        return false;
      }

      if (appointmentFilter !== 'ALL') {
        if (appointmentFilter === 'upcoming' && client.appointmentStatus !== 'upcoming') {
          return false;
        }
        if (
          appointmentFilter === 'scheduled' &&
          client.upcomingAppointments.length === 0 &&
          client.pastAppointments.length === 0
        ) {
          return false;
        }
        if (appointmentFilter === 'none' && client.appointmentStatus !== 'none') {
          return false;
        }
        if (
          appointmentFilter === 'cancelled' &&
          client.cancelledAppointments.length === 0
        ) {
          return false;
        }
        if (
          appointmentFilter === 'completed' &&
          client.completedAppointments.length === 0
        ) {
          return false;
        }
        if (appointmentFilter === 'past' && client.pastAppointments.length === 0) {
          return false;
        }
      }

      if (contactStatusFilter !== 'ALL' && client.contactStatus !== contactStatusFilter) {
        return false;
      }

      if (nextActionFilter !== 'ALL' && client.nextAction !== nextActionFilter) {
        return false;
      }

      if (normalizedSearch) {
        const apptTokens = client.allAppointments
          .map((a) => `${a.bookedBy || ''} ${a.displayTitle || ''} ${a.inviteeEmail || ''}`)
          .join(' ');
        const haystacks = [
          client.fullName,
          client.email || '',
          client.phone || '',
          client.assignedAgentName,
          client.renewalMetadata.healthCarrier || '',
          client.renewalMetadata.healthPlanName || '',
          apptTokens,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystacks.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [
    agentScopedPortfolio,
    primaryView,
    callsShowAll,
    categoryFilter,
    appointmentFilter,
    contactStatusFilter,
    nextActionFilter,
    searchTerm,
  ]);

  // Apply Customer Sorting
  const sortedPortfolio = useMemo(() => {
    const copy = [...filteredPortfolio];
    const dirMultiplier = sortDirection === 'asc' ? 1 : -1;

    const statusRank: Record<OperationsAppointmentStatus, number> = {
      upcoming: 1,
      past: 2,
      completed: 3,
      cancelled: 4,
      none: 5,
    };

    copy.sort((a, b) => {
      if (sortField === 'full_name') {
        return a.fullName.localeCompare(b.fullName) * dirMultiplier;
      }
      if (sortField === 'assigned_agent') {
        return a.assignedAgentName.localeCompare(b.assignedAgentName) * dirMultiplier;
      }
      if (sortField === 'categories_count') {
        const diff = a.categoriesList.length - b.categoriesList.length;
        if (diff !== 0) return diff * dirMultiplier;
        return a.fullName.localeCompare(b.fullName);
      }
      if (sortField === 'appointment_status') {
        const rankDiff = statusRank[a.appointmentStatus] - statusRank[b.appointmentStatus];
        if (rankDiff !== 0) return rankDiff * dirMultiplier;
        return a.fullName.localeCompare(b.fullName);
      }
      if (sortField === 'next_appointment') {
        const aTime = a.nextAppointment
          ? new Date(a.nextAppointment.startsAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bTime = b.nextAppointment
          ? new Date(b.nextAppointment.startsAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) {
          return (aTime - bTime) * dirMultiplier;
        }
        return a.fullName.localeCompare(b.fullName);
      }
      return 0;
    });

    return copy;
  }, [filteredPortfolio, sortField, sortDirection]);

  // Customer Pagination slice
  const totalPages = Math.max(1, Math.ceil(sortedPortfolio.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const startIdx = (safePage - 1) * pageSize;
    return sortedPortfolio.slice(startIdx, startIdx + pageSize);
  }, [sortedPortfolio, safePage, pageSize]);

  const selectedClientRecord = useMemo(() => {
    if (!selectedClientId) return null;
    return clientsPortfolio.find((c) => c.id === selectedClientId) || null;
  }, [clientsPortfolio, selectedClientId]);

  const selectedAppointmentRecord = useMemo(() => {
    if (!selectedAppointmentId) return null;
    return appointmentsList.find((a) => a.id === selectedAppointmentId) || null;
  }, [appointmentsList, selectedAppointmentId]);

  const availableCrmClients = useMemo<CrmCustomerOption[]>(() => {
    return clientsPortfolio.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      categories: c.categoriesList,
    }));
  }, [clientsPortfolio]);

  const handleSortColumn = (field: OperationsSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSortApptColumn = (field: AppointmentsSortField) => {
    if (apptSortField === field) {
      setApptSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setApptSortField(field);
      setApptSortDirection('asc');
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('ALL');
    setAppointmentFilter('ALL');
    if (hasMultiAgentScope) {
      setAgentFilter('ALL');
    }
    setContactStatusFilter('ALL');
    setNextActionFilter('ALL');
  };

  const handleResetApptFilters = () => {
    setApptSearchTerm('');
    setApptDateFilter('ALL');
    setApptCustomDate('');
    setApptStatusFilter('ALL');
    setApptSourceFilter('ALL');
    setApptSubTab('all');
    if (hasMultiAgentScope) {
      setAgentFilter('ALL');
    }
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    categoryFilter !== 'ALL' ||
    appointmentFilter !== 'ALL' ||
    (hasMultiAgentScope && agentFilter !== 'ALL') ||
    contactStatusFilter !== 'ALL' ||
    nextActionFilter !== 'ALL';

  const hasActiveApptFilters =
    apptSearchTerm.trim() !== '' ||
    apptDateFilter !== 'ALL' ||
    apptStatusFilter !== 'ALL' ||
    apptSourceFilter !== 'ALL' ||
    (hasMultiAgentScope && agentFilter !== 'ALL');

  const renderAppointmentStatusBadge = (client: OperationsClientRecord) => {
    if (client.appointmentStatus === 'upcoming') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Upcoming ({client.upcomingAppointments.length})
        </span>
      );
    }
    if (client.appointmentStatus === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Completed
        </span>
      );
    }
    if (client.appointmentStatus === 'past') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Past Scheduled
        </span>
      );
    }
    if (client.appointmentStatus === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
        No appointment
      </span>
    );
  };

  return (
    <DashboardLayout>
      <CrmPageContainer className="space-y-5 pb-12">
        {/* Top Workspace Header */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white">
                  Operations Center
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                  {isAdminUser
                    ? 'Administrator Multi-Agent Scope'
                    : hasMultiAgentScope
                    ? 'Authorized Team Scope'
                    : `Agent Portfolio: ${currentUserName}`}
                </span>
                {lastRefreshedAt && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    Synced{' '}
                    {lastRefreshedAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                {primaryView === 'appointments'
                  ? 'Appointments & Calendly Reconciliation'
                  : 'Client Operations Workspace'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {primaryView === 'appointments'
                  ? 'Enterprise appointment schedule, deterministic Calendly customer matching, and Pending Review reconciliation.'
                  : 'Unified, deduplicated customer portfolio across Health, Life, Medicare, Supplemental, and Property & Casualty with live Calendar & Calendly synchronization.'}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={loadOperationsWorkspace}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <svg
                  className={`w-3.5 h-3.5 ${
                    loading ? 'animate-spin text-blue-600' : 'text-slate-500'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh Data
              </button>

              <NextLink
                href={
                  agentFilter !== 'ALL' && isAdminUser
                    ? `/calendar?viewAsAgent=${encodeURIComponent(agentFilter)}`
                    : '/calendar'
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Open Calendar
              </NextLink>

              <NextLink
                href="/renewals"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                2026 Renewals Module
              </NextLink>
            </div>
          </div>

          {/* Customer Portfolio KPI Strip (Shown on Customer Views; hidden on Appointments so Appointments has strictly 4 KPI cards max) */}
          {primaryView !== 'appointments' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mt-5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'ALL'
                    ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-200'
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total Customers
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.totalClients}
                </div>
                <div className="text-[10px] text-slate-500">1 row per customer</div>
              </button>

              <button
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === 'health' ? 'ALL' : 'health')}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'health'
                    ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                    : 'bg-white border-slate-200 hover:bg-emerald-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Health
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.healthClients}
                </div>
                <div className="text-[10px] text-slate-500">
                  {summaryStats.healthOnlyClients} Health only
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === 'life' ? 'ALL' : 'life')}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'life'
                    ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-200'
                    : 'bg-white border-slate-200 hover:bg-purple-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Life
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.lifeClients}
                </div>
                <div className="text-[10px] text-slate-500">
                  {summaryStats.lifeOnlyClients} Life only
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setCategoryFilter(
                    categoryFilter === 'health_and_life' ? 'ALL' : 'health_and_life'
                  )
                }
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'health_and_life'
                    ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:bg-indigo-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Health + Life
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.healthAndLifeClients}
                </div>
                <div className="text-[10px] text-slate-500">Cross-line clients</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setCategoryFilter(categoryFilter === 'medicare' ? 'ALL' : 'medicare')
                }
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'medicare'
                    ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-200'
                    : 'bg-white border-slate-200 hover:bg-sky-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                  Medicare
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.medicareClients}
                </div>
                <div className="text-[10px] text-slate-500">Active records</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setCategoryFilter(
                    categoryFilter === 'supplemental' ? 'ALL' : 'supplemental'
                  )
                }
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'supplemental'
                    ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200'
                    : 'bg-white border-slate-200 hover:bg-amber-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Supplemental
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.supplementalClients}
                </div>
                <div className="text-[10px] text-slate-500">Active records</div>
              </button>

              <button
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === 'pc' ? 'ALL' : 'pc')}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  categoryFilter === 'pc'
                    ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
                    : 'bg-white border-slate-200 hover:bg-blue-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  P&amp;C
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.pcClients}
                </div>
                <div className="text-[10px] text-slate-500">Property &amp; Casualty</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setAppointmentFilter(
                    appointmentFilter === 'upcoming' ? 'ALL' : 'upcoming'
                  )
                }
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  appointmentFilter === 'upcoming'
                    ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                    : 'bg-white border-slate-200 hover:bg-emerald-50/30'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Upcoming Appts
                </div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {summaryStats.upcomingApptClients}
                </div>
                <div className="text-[10px] text-slate-500">
                  {summaryStats.anyApptClients} customers w/ appts
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 5 Primary Operational View Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-2 flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Operational views"
          >
            {(
              [
                {
                  id: 'all_clients',
                  label: 'All Clients',
                  count: summaryStats.totalClients,
                },
                {
                  id: 'calls',
                  label: 'Calls',
                  count: callsShowAll
                    ? summaryStats.totalClients
                    : summaryStats.outreachCandidates,
                },
                {
                  id: 'appointments',
                  label: 'Appointments',
                  // PART 3: Use appointment records, not distinct customer counts, for appointment KPIs
                  count: agentScopedAppointments.length,
                },
                {
                  id: 'preparation',
                  label: 'Preparation',
                  count: summaryStats.preparationCandidates,
                },
                {
                  id: 'renewals',
                  label: 'Renewals',
                  count: summaryStats.renewalsClients,
                },
              ] as Array<{ id: OperationsPrimaryView; label: string; count: number }>
            ).map((tab) => {
              const active = primaryView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPrimaryView(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-xs font-semibold text-slate-500 px-2">
            {primaryView === 'appointments' ? (
              <>
                Showing{' '}
                <span className="font-extrabold text-slate-900">
                  {visibleAppointments.length}
                </span>{' '}
                of{' '}
                <span className="font-extrabold text-slate-900">
                  {appointmentMetrics.total}
                </span>{' '}
                appointments
              </>
            ) : (
              <>
                Showing{' '}
                <span className="font-extrabold text-slate-900">{sortedPortfolio.length}</span> of{' '}
                <span className="font-extrabold text-slate-900">
                  {summaryStats.totalClients}
                </span>{' '}
                customers
              </>
            )}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* APPOINTMENTS & CALENDLY RECONCILIATION WORKSPACE (PART 1 - PART 4)   */}
        {/* ===================================================================== */}
        {primaryView === 'appointments' ? (
          <div className="space-y-4" data-testid="operations-appointments-workspace">
            {/* PART 3 & PART 4: Four Clickable KPI Cards Maximum */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              data-testid="appointments-kpi-grid"
            >
              {/* Card 1: Today's Appointments */}
              <button
                type="button"
                data-testid="kpi-card-today"
                onClick={() => {
                  setApptDateFilter((prev) => (prev === 'today' ? 'ALL' : 'today'));
                  setApptSubTab('all');
                }}
                className={`text-left p-4 rounded-xl border transition-all bg-white shadow-2xs ${
                  apptDateFilter === 'today'
                    ? 'border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/30'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Today&apos;s Appointments
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    ET Timezone
                  </span>
                </div>
                <div
                  className="text-2xl font-extrabold text-slate-900 mt-2"
                  data-testid="kpi-value-today"
                >
                  {appointmentMetrics.todayCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Scheduled for today ({formatEasternDateKey(new Date())})
                </div>
              </button>

              {/* Card 2: Upcoming */}
              <button
                type="button"
                data-testid="kpi-card-upcoming"
                onClick={() => {
                  setApptSubTab((prev) => (prev === 'upcoming' ? 'all' : 'upcoming'));
                  setApptStatusFilter('ALL');
                }}
                className={`text-left p-4 rounded-xl border transition-all bg-white shadow-2xs ${
                  apptSubTab === 'upcoming' && apptStatusFilter === 'ALL'
                    ? 'border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/30'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Upcoming
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active Schedule
                  </span>
                </div>
                <div
                  className="text-2xl font-extrabold text-slate-900 mt-2"
                  data-testid="kpi-value-upcoming"
                >
                  {appointmentMetrics.upcomingCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Future scheduled appointment records
                </div>
              </button>

              {/* Card 3: Need Preparation */}
              <button
                type="button"
                data-testid="kpi-card-need-preparation"
                onClick={() => {
                  setApptStatusFilter((prev) =>
                    prev === 'need_preparation' ? 'ALL' : 'need_preparation'
                  );
                  setApptSubTab('all');
                }}
                className={`text-left p-4 rounded-xl border transition-all bg-white shadow-2xs ${
                  apptStatusFilter === 'need_preparation'
                    ? 'border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/30'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Need Preparation
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Pre-Meeting
                  </span>
                </div>
                <div
                  className="text-2xl font-extrabold text-slate-900 mt-2"
                  data-testid="kpi-value-need-preparation"
                >
                  {appointmentMetrics.needPreparationCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Upcoming consultations requiring prep or review
                </div>
              </button>

              {/* Card 4: Pending Review */}
              <button
                type="button"
                data-testid="kpi-card-pending-review"
                onClick={() => {
                  setApptSubTab((prev) =>
                    prev === 'pending_review' ? 'all' : 'pending_review'
                  );
                  setApptStatusFilter('ALL');
                }}
                className={`text-left p-4 rounded-xl border transition-all bg-white shadow-2xs ${
                  apptSubTab === 'pending_review'
                    ? 'border-amber-500 ring-2 ring-amber-500/15 bg-amber-50/20'
                    : 'border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Pending Review
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    Manual Verification
                  </span>
                </div>
                <div
                  className="text-2xl font-extrabold text-slate-900 mt-2"
                  data-testid="kpi-value-pending-review"
                >
                  {appointmentMetrics.pendingReview}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Unlinked or shared-email bookings to verify
                </div>
              </button>
            </div>

            {/* PART 3: Secondary Reconciliation Summary Bar */}
            <div
              data-testid="appointments-reconciliation-summary"
              className="bg-white rounded-xl border border-slate-200 shadow-2xs px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  Reconciliation Summary:
                </span>

                <div className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Total Records:</span>
                  <span
                    className="font-extrabold text-slate-900 px-2 py-0.5 rounded bg-slate-100"
                    data-testid="summary-total-records"
                  >
                    {appointmentMetrics.total}
                  </span>
                </div>

                <span className="text-slate-300">|</span>

                <div className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-600 font-medium">Scheduled:</span>
                  <span
                    className="font-extrabold text-slate-900"
                    data-testid="summary-scheduled-records"
                  >
                    {appointmentMetrics.scheduled}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-slate-600 font-medium">Cancelled:</span>
                  <span
                    className="font-extrabold text-slate-900"
                    data-testid="summary-cancelled-records"
                  >
                    {appointmentMetrics.cancelled}
                  </span>
                </div>

                <span className="text-slate-300">|</span>

                <div className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  <span className="text-slate-600 font-medium">Linked:</span>
                  <span
                    className="font-extrabold text-blue-700"
                    data-testid="summary-linked-records"
                  >
                    {appointmentMetrics.linked}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    ({appointmentMetrics.persistedLinked} DB +{' '}
                    {appointmentMetrics.proposedExactNameLinked} Exact-Name Preview)
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-slate-600 font-medium">Pending Review:</span>
                  <span
                    className="font-extrabold text-amber-800"
                    data-testid="summary-pending-review-records"
                  >
                    {appointmentMetrics.pendingReview}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-medium">
                Status ({appointmentMetrics.scheduled} + {appointmentMetrics.cancelled} ={' '}
                {appointmentMetrics.total}) • Linkage ({appointmentMetrics.linked} +{' '}
                {appointmentMetrics.pendingReview} = {appointmentMetrics.total})
              </div>
            </div>

            {/* PART 4: Appointments Sub-Tabs + Compact Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-4">
              {/* Appointments Sub-Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="tablist"
                  aria-label="Appointments sub-tabs"
                >
                  {(
                    [
                      {
                        id: 'all',
                        label: 'All Appointments',
                        count: appointmentMetrics.total,
                      },
                      {
                        id: 'upcoming',
                        label: 'Upcoming',
                        count: appointmentMetrics.upcomingCount,
                      },
                      {
                        id: 'completed',
                        label: 'Completed',
                        count: appointmentMetrics.completed,
                      },
                      {
                        id: 'cancelled',
                        label: 'Cancelled',
                        count: appointmentMetrics.cancelled,
                      },
                      {
                        id: 'pending_review',
                        label: 'Pending Review',
                        count: appointmentMetrics.pendingReview,
                      },
                    ] as Array<{ id: AppointmentsSubTab; label: string; count: number }>
                  ).map((st) => {
                    const isActive = apptSubTab === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        role="tab"
                        data-testid={`appt-subtab-${st.id}`}
                        aria-selected={isActive}
                        onClick={() => setApptSubTab(st.id)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                        }`}
                      >
                        <span>{st.label}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {st.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {hasActiveApptFilters && (
                  <button
                    type="button"
                    onClick={handleResetApptFilters}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700"
                  >
                    Reset Appointment Filters
                  </button>
                )}
              </div>

              {/* Compact Filters Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* 1. Search by booking or customer name */}
                <div>
                  <label
                    htmlFor="appt-search-input"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Search Booking or Customer
                  </label>
                  <input
                    id="appt-search-input"
                    type="text"
                    value={apptSearchTerm}
                    onChange={(e) => setApptSearchTerm(e.target.value)}
                    placeholder="Invitee, customer, email..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* 2. Date Filter */}
                <div>
                  <label
                    htmlFor="appt-date-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Date Filter
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      id="appt-date-filter"
                      value={apptDateFilter}
                      onChange={(e) =>
                        setApptDateFilter(e.target.value as AppointmentsDateFilter)
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="ALL">All dates</option>
                      <option value="today">Today ({formatEasternDateKey(new Date())})</option>
                      <option value="next_7_days">Next 7 days</option>
                      <option value="oct_2026">October 2026</option>
                      <option value="nov_2026">November 2026</option>
                      <option value="custom">Custom date...</option>
                    </select>
                    {apptDateFilter === 'custom' && (
                      <input
                        type="date"
                        value={apptCustomDate}
                        onChange={(e) => setApptCustomDate(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                      />
                    )}
                  </div>
                </div>

                {/* 3. Appointment Status Filter */}
                <div>
                  <label
                    htmlFor="appt-status-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Appointment Status
                  </label>
                  <select
                    id="appt-status-filter"
                    value={apptStatusFilter}
                    onChange={(e) =>
                      setApptStatusFilter(e.target.value as AppointmentsStatusFilter)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ALL">All statuses</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="need_preparation">Need Preparation</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="pending_review">Pending Review</option>
                  </select>
                </div>

                {/* 4. Calendly / CRM Source Filter */}
                <div>
                  <label
                    htmlFor="appt-source-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Booking Source
                  </label>
                  <select
                    id="appt-source-filter"
                    value={apptSourceFilter}
                    onChange={(e) =>
                      setApptSourceFilter(e.target.value as AppointmentsSourceFilter)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ALL">All sources (Calendly &amp; CRM)</option>
                    <option value="Calendly">Calendly</option>
                    <option value="CRM">CRM Manual</option>
                  </select>
                </div>

                {/* 5. Assigned Agent Filter */}
                <div>
                  <label
                    htmlFor="appt-agent-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Assigned Agent
                  </label>
                  <select
                    id="appt-agent-filter"
                    value={agentFilter}
                    disabled={!hasMultiAgentScope}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {hasMultiAgentScope && <option value="ALL">All authorized agents</option>}
                    {availableAgents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* PART 2 & PART 4: Sortable Appointments / Pending Review Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              {loading ? (
                <div className="p-12 text-center space-y-3">
                  <div className="inline-block w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <div className="text-xs font-bold text-slate-600">
                    Loading appointment records and running Calendly customer reconciliation...
                  </div>
                </div>
              ) : visibleAppointments.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="text-sm font-bold text-slate-800">
                    No appointment records match the selected filters
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Try switching sub-tabs or resetting the search, date, status, or source filters.
                  </p>
                </div>
              ) : apptSubTab === 'pending_review' ? (
                /* PART 2: DEDICATED PENDING REVIEW TABLE VIEW */
                <div className="overflow-x-auto" data-testid="pending-review-table-container">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('booking_name')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Booking Name</span>
                            {apptSortField === 'booking_name' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('starts_at')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Appointment Date &amp; Time</span>
                            {apptSortField === 'starts_at' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('status')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Booking Status</span>
                            {apptSortField === 'status' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">Suggested Customer Matches</th>
                        <th className="py-3 px-3">Reason Manual Review Is Required</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {visibleAppointments.map((appt) => {
                        const dt = formatTableAppointmentDate(appt.startsAt);
                        const timeRange = formatAppointmentTimeRange(appt.startsAt, appt.endsAt);

                        return (
                          <tr
                            key={appt.id}
                            onClick={() => setSelectedAppointmentId(appt.id)}
                            className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                          >
                            {/* 1. Booking Name */}
                            <td className="py-3.5 px-4 align-middle">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">
                                  {appt.bookingName}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {appt.inviteeEmail || 'No email provided'}
                                </span>
                                {appt.duplicateAppointmentIds.length > 0 && (
                                  <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 w-fit">
                                    Possible Duplicate ({appt.duplicateAppointmentIds.length + 1} slots)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Appointment Date & Time */}
                            <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">{dt.dateLine}</span>
                                <span className="text-[11px] text-slate-500">{timeRange}</span>
                              </div>
                            </td>

                            {/* 3. Booking Status */}
                            <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                              {appt.status === 'cancelled' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Cancelled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Scheduled
                                </span>
                              )}
                            </td>

                            {/* 4. Suggested Customer Matches */}
                            <td className="py-3.5 px-3 align-middle">
                              {appt.suggestedCandidates.length > 0 ? (
                                <div className="space-y-1">
                                  {appt.suggestedCandidates.map((cand) => (
                                    <div
                                      key={cand.clientId}
                                      className="flex items-center gap-1.5 flex-wrap"
                                    >
                                      <NextLink
                                        href={`/clients/${cand.clientId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-bold text-blue-700 hover:underline"
                                      >
                                        {cand.fullName}
                                      </NextLink>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                          cand.isValidatedPrimary
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : cand.confidence === 'high'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}
                                      >
                                        {cand.matchTypeLabel}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  Potential New Customer (No CRM Match)
                                </span>
                              )}
                            </td>

                            {/* 5. Reason Manual Review Is Required */}
                            <td className="py-3.5 px-3 align-middle max-w-xs">
                              <div className="font-bold text-slate-800">
                                {appt.pendingReviewReasonLabel}
                              </div>
                              <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                {appt.pendingReviewReasonDetail}
                              </div>
                            </td>

                            {/* 6. Action */}
                            <td
                              className="py-3.5 px-4 align-middle text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedAppointmentId(appt.id)}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                              >
                                Inspect Booking
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* PART 4: MAIN SORTABLE APPOINTMENTS TABLE */
                <div className="overflow-x-auto" data-testid="appointments-table-container">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('booking_name')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Booking / Invitee</span>
                            {apptSortField === 'booking_name' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('starts_at')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Date &amp; Time (ET)</span>
                            {apptSortField === 'starts_at' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('status')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Booking Status</span>
                            {apptSortField === 'status' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('customer_name')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>CRM Customer / Candidate</span>
                            {apptSortField === 'customer_name' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('match_status')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Reconciliation Status</span>
                            {apptSortField === 'match_status' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-3">Source</th>
                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortApptColumn('assigned_agent')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Agent</span>
                            {apptSortField === 'assigned_agent' && (
                              <span>{apptSortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {visibleAppointments.map((appt) => {
                        const dt = formatTableAppointmentDate(appt.startsAt);
                        const timeRange = formatAppointmentTimeRange(appt.startsAt, appt.endsAt);

                        return (
                          <tr
                            key={appt.id}
                            onClick={() => setSelectedAppointmentId(appt.id)}
                            className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                          >
                            {/* 1. Booking / Invitee */}
                            <td className="py-3 px-4 align-middle">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">
                                  {appt.bookingName}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {appt.inviteeEmail || 'No email'}
                                </span>
                              </div>
                            </td>

                            {/* 2. Date & Time */}
                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">{dt.dateLine}</span>
                                <span className="text-[11px] text-slate-500">{timeRange}</span>
                              </div>
                            </td>

                            {/* 3. Booking Status */}
                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              {appt.status === 'cancelled' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Cancelled
                                </span>
                              ) : appt.status === 'completed' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  Completed
                                </span>
                              ) : appt.temporalState === 'upcoming' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Upcoming
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  Past Scheduled
                                </span>
                              )}
                            </td>

                            {/* 4. CRM Customer / Candidate */}
                            <td className="py-3 px-3 align-middle">
                              {appt.isLinked && appt.resolvedClientId ? (
                                <div className="flex flex-col">
                                  <NextLink
                                    href={`/clients/${appt.resolvedClientId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-bold text-slate-900 hover:text-blue-600 transition-colors"
                                  >
                                    {appt.resolvedClientName}
                                  </NextLink>
                                  {appt.resolvedClientCategories.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {appt.resolvedClientCategories.map((cat) => (
                                        <span
                                          key={cat}
                                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${CATEGORY_BADGE_META[cat].className}`}
                                        >
                                          {CATEGORY_BADGE_META[cat].shortLabel}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : appt.suggestedCandidates.length > 0 ? (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-800">
                                    Suggested: {appt.suggestedCandidates[0].fullName}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {appt.suggestedCandidates.length > 1
                                      ? `+${appt.suggestedCandidates.length - 1} other candidate(s)`
                                      : appt.suggestedCandidates[0].matchTypeLabel}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">
                                  Unlinked (New Customer Candidate)
                                </span>
                              )}
                            </td>

                            {/* 5. Reconciliation Status */}
                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
                                  appt.isPendingReview
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : appt.isProposedPreview
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {appt.matchMethodBadge}
                              </span>
                            </td>

                            {/* 6. Source */}
                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {appt.source}
                              </span>
                            </td>

                            {/* 7. Agent */}
                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <span className="font-semibold text-slate-700">
                                {appt.assignedAgentName}
                              </span>
                            </td>

                            {/* 8. Actions */}
                            <td
                              className="py-3 px-4 align-middle text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAppointmentId(appt.id)}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                                >
                                  Inspect Booking
                                </button>
                                {appt.resolvedClientId && (
                                  <NextLink
                                    href={`/clients/${appt.resolvedClientId}`}
                                    className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                                  >
                                    Profile
                                  </NextLink>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ===================================================================== */
          /* CUSTOMER PORTFOLIO VIEWS (All Clients, Calls, Preparation, Renewals)  */
          /* ===================================================================== */
          <>
            {/* View-Specific Context Banner */}
            {primaryView === 'calls' && (
              <div className="bg-amber-50/90 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Calls Operational Queue — Phase 1 Status Notice
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Persistent call disposition logging (<code className="font-mono">Contact status</code> and <code className="font-mono">Next action</code>) is not yet configured in the Supabase database schema. No call statuses are fabricated; all rows display verified contact numbers and neutral <span className="font-semibold">Not recorded</span> states.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer shrink-0 bg-white px-3 py-1.5 rounded-lg border border-amber-200">
                  <input
                    type="checkbox"
                    checked={callsShowAll}
                    onChange={(e) => setCallsShowAll(e.target.checked)}
                    className="rounded border-amber-300 text-blue-600 focus:ring-blue-500"
                  />
                  Include customers with upcoming appointments
                </label>
              </div>
            )}

            {primaryView === 'preparation' && (
              <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-indigo-900">
                    Appointment &amp; Plan Preparation View
                  </div>
                  <p className="text-[11px] text-indigo-800">
                    Displays customers with upcoming scheduled appointments or active Health policies so agents can review customer information, plan selections, and booklets ahead of meetings.
                  </p>
                </div>
              </div>
            )}

            {primaryView === 'renewals' && (
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-emerald-900">
                    Renewals Operational View (Health &amp; P&amp;C Expirations)
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Displays customers holding Health renewal policies or Property &amp; Casualty policies with expiration dates. The dedicated 2026 Health Renewals workspace remains available at <code className="font-mono">/renewals</code>.
                  </p>
                </div>
                <NextLink
                  href="/renewals"
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 transition-colors"
                >
                  Open 2026 Renewals Workspace
                </NextLink>
              </div>
            )}

            {/* Combinable Filter Bar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                  Combinable Operational Filters
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search Input */}
                <div className="lg:col-span-1">
                  <label
                    htmlFor="ops-search-input"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Search Customer
                  </label>
                  <input
                    id="ops-search-input"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Name, phone, email..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Insurance Category Filter */}
                <div>
                  <label
                    htmlFor="ops-category-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Insurance Category
                  </label>
                  <select
                    id="ops-category-filter"
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as InsuranceCategoryFilterMode)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ALL">All clients ({summaryStats.totalClients})</option>
                    <option value="health">Health ({summaryStats.healthClients})</option>
                    <option value="life">Life ({summaryStats.lifeClients})</option>
                    <option value="medicare">Medicare ({summaryStats.medicareClients})</option>
                    <option value="supplemental">
                      Supplemental ({summaryStats.supplementalClients})
                    </option>
                    <option value="pc">Property &amp; Casualty ({summaryStats.pcClients})</option>
                    <option value="health_only">
                      Health only ({summaryStats.healthOnlyClients})
                    </option>
                    <option value="life_only">Life only ({summaryStats.lifeOnlyClients})</option>
                    <option value="health_and_life">
                      Health + Life ({summaryStats.healthAndLifeClients})
                    </option>
                  </select>
                </div>

                {/* Appointment Status Filter */}
                <div>
                  <label
                    htmlFor="ops-appointment-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Appointment Status
                  </label>
                  <select
                    id="ops-appointment-filter"
                    value={appointmentFilter}
                    onChange={(e) =>
                      setAppointmentFilter(e.target.value as OperationsAppointmentFilter)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ALL">All appointment states</option>
                    <option value="upcoming">Upcoming appointment</option>
                    <option value="scheduled">Appointment scheduled (Upcoming or Past)</option>
                    <option value="none">No appointment</option>
                    <option value="cancelled">Appointment cancelled</option>
                    <option value="completed">Appointment completed</option>
                    <option value="past">Past scheduled</option>
                  </select>
                </div>

                {/* Assigned Agent Filter */}
                <div>
                  <label
                    htmlFor="ops-agent-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Assigned Agent
                  </label>
                  <select
                    id="ops-agent-filter"
                    value={agentFilter}
                    disabled={!hasMultiAgentScope}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {hasMultiAgentScope && <option value="ALL">All authorized agents</option>}
                    {availableAgents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contact Status Filter */}
                <div>
                  <label
                    htmlFor="ops-contact-status-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Contact Status
                  </label>
                  <select
                    id="ops-contact-status-filter"
                    value={contactStatusFilter}
                    onChange={(e) =>
                      setContactStatusFilter(
                        e.target.value as 'ALL' | OperationsContactStatus
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ALL">All contact states</option>
                    <option value="not_recorded">Not recorded (Current DB state)</option>
                    <option value="not_contacted">Not contacted (Workflow phase 2)</option>
                    <option value="contacted">Contacted (Workflow phase 2)</option>
                    <option value="no_answer">No answer (Workflow phase 2)</option>
                    <option value="follow_up_required">
                      Follow-up required (Workflow phase 2)
                    </option>
                    <option value="appointment_requested">
                      Appointment requested (Workflow phase 2)
                    </option>
                    <option value="not_interested">Not interested (Workflow phase 2)</option>
                  </select>
                </div>

                {/* Next Action Filter */}
                <div>
                  <label
                    htmlFor="ops-next-action-filter"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
                  >
                    Next Action
                  </label>
                  <select
                    id="ops-next-action-filter"
                    value={nextActionFilter}
                    onChange={(e) =>
                      setNextActionFilter(e.target.value as 'ALL' | OperationsNextAction)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="ALL">All next actions</option>
                    <option value="not_recorded">Not recorded (Current DB state)</option>
                    <option value="call_customer">Call customer (Workflow phase 2)</option>
                    <option value="call_back">Call back (Workflow phase 2)</option>
                    <option value="schedule_appointment">
                      Schedule appointment (Workflow phase 2)
                    </option>
                    <option value="send_booklet">Send booklet (Workflow phase 2)</option>
                    <option value="send_qualification_bot">
                      Send qualification bot (Workflow phase 2)
                    </option>
                    <option value="review_customer_info">
                      Review customer information (Workflow phase 2)
                    </option>
                    <option value="review_selected_plan">
                      Review selected plan (Workflow phase 2)
                    </option>
                    <option value="ready_for_enrollment">
                      Ready for enrollment (Workflow phase 2)
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {/* Main Operations Customer Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              {errorMessage && (
                <div className="p-6 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-semibold">
                  {errorMessage}
                </div>
              )}

              {loading ? (
                <div className="p-12 text-center space-y-3">
                  <div className="inline-block w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <div className="text-xs font-bold text-slate-600">
                    Loading unified customer portfolio, policy categories, and synchronized appointments...
                  </div>
                </div>
              ) : sortedPortfolio.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="text-sm font-bold text-slate-800">
                    No customer records match the selected operational filters
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {contactStatusFilter !== 'ALL' && contactStatusFilter !== 'not_recorded'
                      ? 'Persistent Contact Status tracking is scheduled for Phase 2 schema integration. Currently all records have a neutral "Not recorded" contact status.'
                      : nextActionFilter !== 'ALL' && nextActionFilter !== 'not_recorded'
                      ? 'Persistent Next Action tracking is scheduled for Phase 2 schema integration. Currently all records have a neutral "Not recorded" next action.'
                      : 'Try adjusting your category, appointment status, agent, or search filters.'}
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSortColumn('full_name')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Customer Name</span>
                            {sortField === 'full_name' && (
                              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>

                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortColumn('categories_count')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Insurance Categories</span>
                            {sortField === 'categories_count' && (
                              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>

                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortColumn('assigned_agent')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Assigned Agent</span>
                            {sortField === 'assigned_agent' && (
                              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>

                        <th className="py-3 px-3">Phone Number</th>
                        <th className="py-3 px-3">Email</th>

                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortColumn('appointment_status')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Appointment Status</span>
                            {sortField === 'appointment_status' && (
                              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>

                        <th className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleSortColumn('next_appointment')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            <span>Next Appointment</span>
                            {sortField === 'next_appointment' && (
                              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </th>

                        <th className="py-3 px-3">Contact Status</th>
                        <th className="py-3 px-3">Next Action</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedRows.map((client) => {
                        const nextApptFormatted = client.nextAppointment
                          ? formatTableAppointmentDate(client.nextAppointment.startsAt)
                          : null;

                        return (
                          <tr
                            key={client.id}
                            onClick={() => setSelectedClientId(client.id)}
                            className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-4 align-middle">
                              <div className="flex flex-col">
                                <NextLink
                                  href={`/clients/${client.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-bold text-slate-900 hover:text-blue-600 transition-colors"
                                >
                                  {client.fullName}
                                </NextLink>
                                {client.renewalMetadata.healthCarrier && (
                                  <span className="text-[10px] text-slate-500 truncate max-w-[200px]">
                                    {client.renewalMetadata.healthCarrier}
                                    {client.renewalMetadata.healthPlanName
                                      ? ` • ${client.renewalMetadata.healthPlanName}`
                                      : ''}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-3 align-middle">
                              {client.categoriesList.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {client.categoriesList.map((cat) => {
                                    const badge = CATEGORY_BADGE_META[cat];
                                    const count = client.policyCounts[cat];
                                    return (
                                      <span
                                        key={cat}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.className}`}
                                      >
                                        <span>{badge.shortLabel}</span>
                                        {count > 1 && (
                                          <span className="opacity-75">({count})</span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">
                                  No active policy lines
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 align-middle">
                              <span className="font-semibold text-slate-700">
                                {client.assignedAgentName}
                              </span>
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              {client.phone ? (
                                <a
                                  href={`tel:${client.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-medium text-slate-700 hover:text-blue-600"
                                >
                                  {client.phone}
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3 align-middle">
                              {client.email ? (
                                <a
                                  href={`mailto:${client.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-slate-600 hover:text-blue-600 truncate block max-w-[180px]"
                                  title={client.email}
                                >
                                  {client.email}
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              {renderAppointmentStatusBadge(client)}
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              {client.nextAppointment && nextApptFormatted ? (
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900">
                                    {nextApptFormatted.dateLine}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {nextApptFormatted.timeLine} • {client.nextAppointment.source}
                                    {client.nextAppointment.isProposedPreview
                                      ? ' (Exact-Name Preview)'
                                      : ''}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Not recorded
                              </span>
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Not recorded
                              </span>
                            </td>

                            <td
                              className="py-3 px-4 align-middle text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedClientId(client.id)}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                                >
                                  Details
                                </button>
                                <NextLink
                                  href={`/clients/${client.id}`}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                                >
                                  Profile
                                </NextLink>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Customer Pagination Footer */}
              {!loading && sortedPortfolio.length > 0 && (
                <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>
                      Showing{' '}
                      <span className="font-bold text-slate-900">
                        {(safePage - 1) * pageSize + 1}
                      </span>{' '}
                      –{' '}
                      <span className="font-bold text-slate-900">
                        {Math.min(safePage * pageSize, sortedPortfolio.length)}
                      </span>{' '}
                      of <span className="font-bold text-slate-900">{sortedPortfolio.length}</span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <label className="inline-flex items-center gap-1.5">
                      <span>Rows:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-bold text-slate-800"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-xs font-bold text-slate-700">
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CrmPageContainer>

      {/* Right-Side Customer Details Drawer */}
      <OperationsCustomerDrawer
        client={selectedClientRecord}
        onClose={() => setSelectedClientId(null)}
      />

      {/* Right-Side Appointment Details & Reconciliation Drawer */}
      <OperationsAppointmentDrawer
        appointment={selectedAppointmentRecord}
        allAppointments={agentScopedAppointments}
        availableClients={availableCrmClients}
        onClose={() => setSelectedAppointmentId(null)}
        onSelectAppointment={(id) => setSelectedAppointmentId(id)}
        onConfirmLinkClient={handleConfirmLinkClient}
        onUnlinkAppointment={handleUnlinkAppointment}
        isAdminView={isAdminUser}
        currentUserId={currentUserId}
      />
    </DashboardLayout>
  );
}

export default function OperationsCenterPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <CrmPageContainer className="py-12 text-center text-xs font-bold text-slate-500">
            Loading Operations Center...
          </CrmPageContainer>
        </DashboardLayout>
      }
    >
      <OperationsCenterInner />
    </Suspense>
  );
}
