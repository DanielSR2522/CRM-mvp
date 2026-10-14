'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  ExtendedCalendarEventProps,
  AppointmentStatus,
  CalendlyInviteeSummary,
  AmbiguousClientMatchInfo,
} from '@/lib/calendar/types';
import {
  formatIsoToUsDate,
  formatAsDateInput,
  usDateToIso,
  parseUsDateAnd12hTimeToDate,
  extractUsDateAnd12hTime,
} from '@/utils/dateUtils';
import DatePicker from '@/components/ui/DatePicker';

interface ClientOption {
  id: string;
  full_name: string;
}

export interface ParsedAppointmentDescription {
  userNotes: string;
  meetingUrl?: string | null;
  cancellationReason?: string | null;
  hasTechnicalBlock: boolean;
  rawTechnicalBlock?: string | null;
  isCalendly: boolean;
  source: 'Calendly' | 'CRM';
  eventName?: string | null;
  bookedBy?: string | null;
  inviteeEmail?: string | null;
  invitees: CalendlyInviteeSummary[];
  matchStatus?: 'matched' | 'unmatched' | 'ambiguous' | null;
  ambiguousClients: AmbiguousClientMatchInfo[];
}

/**
 * Parses a single "Name <email>" or "Name" invitee token.
 */
function parseInviteeToken(token: string): CalendlyInviteeSummary | null {
  const cleaned = token.trim();
  if (!cleaned) return null;

  const angleMatch = cleaned.match(/^(.+?)\s*<([^>]*)>\s*$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/\s+/g, ' ');
    const rawEmail = angleMatch[2].trim();
    const email = rawEmail.toLowerCase() === 'no email' ? '' : rawEmail;
    return {
      name: rawName || (email ? email.split('@')[0] : 'Calendly Invitee'),
      email,
    };
  }

  return {
    name: cleaned.replace(/\s+/g, ' '),
    email: '',
  };
}

/**
 * Parses raw appointment description (and optional title fallback) to separate user notes / Q&A
 * from technical Calendly metadata, while extracting invitee identification and client match details.
 */
export function parseAppointmentDescription(
  rawDesc?: string | null,
  rawTitle?: string | null
): ParsedAppointmentDescription {
  if (!rawDesc) {
    return {
      userNotes: '',
      hasTechnicalBlock: false,
      isCalendly: false,
      source: 'CRM',
      invitees: [],
      ambiguousClients: [],
    };
  }

  const technicalSplitMarker = '\n---\n[Calendly Integration Details]';
  const altSplitMarker = '[Calendly Integration Details]';

  let userNotes = rawDesc;
  let technicalPart = '';

  if (rawDesc.includes(technicalSplitMarker)) {
    const parts = rawDesc.split(technicalSplitMarker);
    userNotes = parts[0].trim();
    technicalPart = parts.slice(1).join(technicalSplitMarker).trim();
  } else if (rawDesc.includes(altSplitMarker)) {
    const parts = rawDesc.split(altSplitMarker);
    userNotes = parts[0].replace(/---\s*$/, '').trim();
    technicalPart = parts.slice(1).join(altSplitMarker).trim();
  }

  let meetingUrl: string | null = null;
  let cancellationReason: string | null = null;
  let eventName: string | null = null;
  let explicitBookedBy: string | null = null;
  let explicitInviteeEmail: string | null = null;
  let matchStatus: 'matched' | 'unmatched' | 'ambiguous' | null = null;
  const invitees: CalendlyInviteeSummary[] = [];
  const ambiguousClients: AmbiguousClientMatchInfo[] = [];

  const addUniqueInvitee = (inv: CalendlyInviteeSummary | null) => {
    if (!inv) return;
    const key = `${inv.name.toLowerCase()}|${inv.email.toLowerCase()}`;
    const exists = invitees.some(
      (existing) => `${existing.name.toLowerCase()}|${existing.email.toLowerCase()}` === key
    );
    if (!exists) {
      invitees.push(inv);
    }
  };

  if (technicalPart) {
    const lines = technicalPart.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Meeting Location:')) {
        const val = trimmed.replace('Meeting Location:', '').trim();
        if (val && !val.toLowerCase().includes('calendly (')) {
          meetingUrl = val;
        }
      } else if (trimmed.startsWith('Cancellation Reason:')) {
        cancellationReason = trimmed.replace('Cancellation Reason:', '').trim();
      } else if (trimmed.startsWith('Event:')) {
        const val = trimmed.replace('Event:', '').trim().replace(/\s+/g, ' ');
        if (val) eventName = val;
      } else if (trimmed.startsWith('Booked By:')) {
        const val = trimmed.replace('Booked By:', '').trim().replace(/\s+/g, ' ');
        if (val) explicitBookedBy = val;
      } else if (trimmed.startsWith('Invitee Email:')) {
        const val = trimmed.replace('Invitee Email:', '').trim();
        if (val && val.toLowerCase() !== 'no email') {
          explicitInviteeEmail = val;
        }
      } else if (trimmed.startsWith('Invitee:')) {
        const val = trimmed.replace('Invitee:', '').trim();
        addUniqueInvitee(parseInviteeToken(val));
      } else if (trimmed.startsWith('Event Invitees:')) {
        const val = trimmed.replace('Event Invitees:', '').trim();
        val
          .split(';')
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((tok) => addUniqueInvitee(parseInviteeToken(tok)));
      } else if (trimmed.startsWith('Client Match Status:')) {
        const val = trimmed.replace('Client Match Status:', '').trim().toLowerCase();
        if (val === 'matched' || val === 'unmatched' || val === 'ambiguous') {
          matchStatus = val;
        }
      } else if (trimmed.startsWith('Ambiguous Client Matches:')) {
        const val = trimmed.replace('Ambiguous Client Matches:', '').trim();
        val
          .split('|')
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((entry) => {
            const match = entry.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
            if (match) {
              ambiguousClients.push({
                id: match[2].trim(),
                full_name: match[1].trim(),
                email: null,
              });
            } else {
              ambiguousClients.push({
                id: entry,
                full_name: entry,
                email: null,
              });
            }
          });
      }
    }
  }

  const isCalendly = Boolean(technicalPart);

  // Fallback extraction from title if needed
  if (isCalendly && rawTitle) {
    const cleanTitle = rawTitle.replace(/^\[Cancelada\]\s*/i, '').trim();
    if (cleanTitle.includes(' — ')) {
      const [personPart, ...eventParts] = cleanTitle.split(' — ');
      const evPart = eventParts.join(' — ').trim();
      if (!explicitBookedBy && invitees.length === 0 && personPart.trim()) {
        explicitBookedBy = personPart.trim();
      }
      if (!eventName && evPart) {
        eventName = evPart;
      }
    } else if (cleanTitle.includes(' - ')) {
      const parts = cleanTitle.split(' - ');
      const lastPart = parts[parts.length - 1]?.trim();
      const firstPart = parts.slice(0, -1).join(' - ').trim().replace(/\s+/g, ' ');
      if (!eventName && firstPart) {
        eventName = firstPart;
      }
      if (!explicitBookedBy && invitees.length === 0 && lastPart) {
        explicitBookedBy = lastPart;
      }
    }
  }

  const bookedByFromInvitees =
    invitees.length > 0 ? invitees.map((i) => i.name).filter(Boolean).join(', ') : null;
  const emailFromInvitees =
    invitees.length > 0 ? invitees.map((i) => i.email).filter(Boolean).join(', ') : null;

  const bookedBy =
    (invitees.length > 1 ? bookedByFromInvitees : explicitBookedBy || bookedByFromInvitees) ||
    null;
  const inviteeEmail =
    (invitees.length > 1 ? emailFromInvitees : explicitInviteeEmail || emailFromInvitees) ||
    null;

  return {
    userNotes,
    meetingUrl,
    cancellationReason,
    hasTechnicalBlock: isCalendly,
    rawTechnicalBlock: technicalPart ? `\n---\n[Calendly Integration Details]\n${technicalPart}` : null,
    isCalendly,
    source: isCalendly ? 'Calendly' : 'CRM',
    eventName,
    bookedBy,
    inviteeEmail,
    invitees,
    matchStatus,
    ambiguousClients,
  };
}

/**
 * Formats the appointment title for display in the CRM Calendar grid and list views.
 * Calendly appointments always display as: "Maria Gonzalez — Medicare Consultation"
 */
export function formatCalendarAppointmentDisplayTitle(params: {
  rawTitle: string;
  parsed: ParsedAppointmentDescription;
  clientName?: string | null;
  isCancelled?: boolean;
}): string {
  const { rawTitle, parsed, clientName, isCancelled } = params;
  const strippedTitle = (rawTitle || '').replace(/^\[Cancelada\]\s*/i, '').trim();

  let baseTitle = strippedTitle;
  if (parsed.isCalendly) {
    const personName = (parsed.bookedBy || clientName || 'Calendly Invitee').trim().replace(/\s+/g, ' ');
    const eventName = (parsed.eventName || strippedTitle || 'Consultation').trim().replace(/\s+/g, ' ');
    baseTitle = `${personName} — ${eventName}`;
  } else if (clientName && !strippedTitle.toLowerCase().includes(clientName.toLowerCase())) {
    baseTitle = `${strippedTitle} (${clientName})`;
  }

  return isCancelled ? `[Cancelada] ${baseTitle}` : baseTitle;
}

const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

/** Formats ISO timestamp to US format: MM/DD/YYYY, hh:mm AM/PM */
const formatTimestampToUsDateTime = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${mm}/${dd}/${yyyy}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

/** Formats ISO timestamp to US Date only: MM/DD/YYYY */
const formatTimestampToUsDateOnly = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

/** Formats ISO timestamp to 12h time only: hh:mm AM/PM */
const formatTimestampToUsTimeOnly = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

/** Formats start & end ISO timestamps as a 12h time range: hh:mm AM/PM – hh:mm AM/PM */
const formatTimestampRangeToUsTime = (
  startIso: string | null | undefined,
  endIso: string | null | undefined
): string => {
  if (!startIso) return 'N/A';
  const startStr = formatTimestampToUsTimeOnly(startIso);
  if (!endIso) return startStr;
  const endStr = formatTimestampToUsTimeOnly(endIso);
  return `${startStr} – ${endStr}`;
};

export default function CalendarPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Toggle for showing cancelled appointments (disabled by default)
  const [showCancelled, setShowCancelled] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const savedShowCancelled = localStorage.getItem('smartrack:calendar_show_cancelled');
    if (savedShowCancelled !== null) {
      setShowCancelled(savedShowCancelled === 'true');
    }
  }, []);

  const handleToggleShowCancelled = () => {
    setShowCancelled((prev) => {
      const nextVal = !prev;
      localStorage.setItem('smartrack:calendar_show_cancelled', String(nextVal));
      return nextVal;
    });
  };

  // Events & Client List
  const [events, setEvents] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  // Modal States
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState<ExtendedCalendarEventProps | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<ExtendedCalendarEventProps | null>(null);

  // New/Edit Appointment Form State (Separate Controlled Date & 12h Time Inputs)
  const [formAppointmentId, setFormAppointmentId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formClientId, setFormClientId] = useState('');
  
  const [formStartDateUs, setFormStartDateUs] = useState('');
  const [formStartHour, setFormStartHour] = useState('09');
  const [formStartMinute, setFormStartMinute] = useState('00');
  const [formStartAmPm, setFormStartAmPm] = useState<'AM' | 'PM'>('AM');

  const [formEndDateUs, setFormEndDateUs] = useState('');
  const [formEndHour, setFormEndHour] = useState('10');
  const [formEndMinute, setFormEndMinute] = useState('00');
  const [formEndAmPm, setFormEndAmPm] = useState<'AM' | 'PM'>('AM');

  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTechnicalBlock, setFormTechnicalBlock] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<AppointmentStatus>('scheduled');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin Context & View As Agent Mode States
  const [adminContext, setAdminContext] = useState<{
    isAdmin: boolean;
    currentUserId?: string;
    currentUserEmail?: string;
    currentUserName?: string;
    targetAgent?: { id: string; name: string; email: string };
    availableAgents?: Array<{ id: string; name: string; email: string }>;
  } | null>(null);
  const [viewAsAgentId, setViewAsAgentId] = useState<string | null>(null);

  // Calendly Sync States
  const [calendlyStatus, setCalendlyStatus] = useState<{
    isConfigured: boolean;
    isAuthorized: boolean;
    connected?: boolean;
    calendlyUserName?: string;
    targetEventUrl?: string;
    eventName?: string;
    error?: string;
  } | null>(null);
  const [calendlySyncing, setCalendlySyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const loadAdminContext = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/admin/context');
      if (res.ok) {
        const data = await res.json();
        setAdminContext(data);
        if (data.isAdmin) {
          const saved = sessionStorage.getItem('smartrack:admin_view_as_agent');
          if (saved) {
            setViewAsAgentId(saved);
          }
        } else {
          setViewAsAgentId(null);
          sessionStorage.removeItem('smartrack:admin_view_as_agent');
        }
      }
    } catch (err) {
      console.error('Failed to load admin context:', err);
    }
  }, []);

  const handleSwitchViewAs = (agentId: string | null) => {
    if (!adminContext?.isAdmin) return;
    setViewAsAgentId(agentId);
    if (agentId) {
      sessionStorage.setItem('smartrack:admin_view_as_agent', agentId);
      const agentObj =
        agentId === adminContext.targetAgent?.id
          ? adminContext.targetAgent
          : adminContext.availableAgents?.find((a) => a.id === agentId);
      flashNotice(`Switched viewing context to ${agentObj?.name || 'Agent'}.`);
    } else {
      sessionStorage.removeItem('smartrack:admin_view_as_agent');
      flashNotice('Returned to your administrator calendar.');
    }
  };

  const handleExitViewAs = () => {
    handleSwitchViewAs(null);
  };

  const loadCalendlyStatus = useCallback(async (targetId?: string | null) => {
    try {
      const url = targetId
        ? `/api/calendar/calendly/status?targetAgentId=${encodeURIComponent(targetId)}`
        : '/api/calendar/calendly/status';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCalendlyStatus(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setCalendlyStatus({
          isConfigured: !!data.isConfigured,
          isAuthorized: false,
          error: data.reason || data.error || 'Unauthorized context.',
        });
      }
    } catch (err) {
      console.error('Failed to load Calendly status:', err);
    }
  }, []);

  const handleSyncCalendly = async () => {
    try {
      setCalendlySyncing(true);
      setError(null);
      const targetId = adminContext?.isAdmin && viewAsAgentId ? viewAsAgentId : undefined;
      const res = await fetch('/api/calendar/calendly/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgentId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to synchronize Calendly bookings.');
      }
      const syncTime = data.lastSync || new Date().toISOString();
      setLastSyncTime(syncTime);
      localStorage.setItem('smartrack:calendly_last_sync', syncTime);

      let summaryText = `Calendly Sync Complete: ${data.syncedCount} bookings processed (${data.newCount} new, ${data.updatedCount} updated`;
      if (data.newlyCancelledCount && data.newlyCancelledCount > 0) {
        summaryText += `, ${data.newlyCancelledCount} citas fueron canceladas`;
      }
      if (data.ambiguousClientsCount && data.ambiguousClientsCount > 0) {
        summaryText += `, ${data.ambiguousClientsCount} con coincidencia de email ambigua`;
      }
      summaryText += ').';

      flashNotice(summaryText);
      await loadCalendarData();
    } catch (syncErr: any) {
      console.error('Error during Calendly sync:', syncErr);
      setError(`Calendly Sync Error: ${syncErr?.message || 'Failed to sync with Calendly.'}`);
    } finally {
      setCalendlySyncing(false);
    }
  };

  // Independent Data Loader for Calendar
  const loadCalendarData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setAppointmentError(null);
      setPolicyError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[NavTrace]', {
          source: 'CalendarPage loadCalendarData',
          event: 'USER_NULL',
          currentPath: typeof window !== 'undefined' ? window.location.pathname : '/calendar',
          target: 'none',
          reason: 'User null during calendar load; skipping router.push to prevent tab-switch redirect',
        });
        setLoading(false);
        return;
      }
      setCurrentUser(user);

      // Fetch Clients for dropdown, ID lookup map, and normalized email lookup map
      const clientMap = new Map<string, any>();
      const clientsByEmail = new Map<string, AmbiguousClientMatchInfo[]>();
      try {
        const { data: clientsData, error: clientsErr } = await supabase
          .from('clients')
          .select('id, full_name, email, phone')
          .order('full_name', { ascending: true });

        if (!clientsErr && clientsData) {
          setClients(clientsData.map((c) => ({ id: c.id, full_name: c.full_name })));
          clientsData.forEach((c) => {
            clientMap.set(c.id, c);
            if (c.email) {
              const normEmail = c.email.trim().toLowerCase();
              if (normEmail) {
                const existing = clientsByEmail.get(normEmail) || [];
                existing.push({ id: c.id, full_name: c.full_name, email: c.email });
                clientsByEmail.set(normEmail, existing);
              }
            }
          });
        }
      } catch (clientFetchErr) {
        console.error('Error fetching clients list:', clientFetchErr);
      }

      let fetchedExpirations: any[] = [];
      let fetchedAppointments: any[] = [];

      // 1. INDEPENDENT QUERY: Policy Expirations
      try {
        const { data: policiesData, error: policiesErr } = await supabase
          .from('policies')
          .select('id, client_id, policy_number, policy_type, company_name, writing_company, expiration_date')
          .not('expiration_date', 'is', null);

        if (policiesErr) throw policiesErr;

        fetchedExpirations = (policiesData || [])
          .filter((pol: any) => Boolean(pol.expiration_date))
          .map((pol: any) => {
            const client = clientMap.get(pol.client_id);
            const clientName = client?.full_name || 'Client';
            const company = pol.company_name || pol.writing_company || 'N/A';
            const cleanExpDate = String(pol.expiration_date).split('T')[0];

            return {
              id: `expiration-${pol.id}`,
              title: `Expires: ${clientName} - ${pol.policy_type}`,
              start: cleanExpDate,
              allDay: true,
              backgroundColor: '#ef4444',
              borderColor: '#dc2626',
              textColor: '#ffffff',
              extendedProps: {
                eventType: 'policy_expiration',
                policyId: pol.id,
                clientId: pol.client_id,
                clientName,
                policyType: pol.policy_type,
                policyNumber: pol.policy_number || 'N/A',
                company,
                expirationDate: cleanExpDate,
              } as ExtendedCalendarEventProps,
            };
          });
      } catch (err: any) {
        console.error('Error loading policy expirations:', err);
        setPolicyError('Could not load policy expirations: ' + (err?.message || 'Database query failed.'));
      }

      // 2. INDEPENDENT QUERY: Calendar Appointments (Includes assistant relationship & Admin View-As scope)
      try {
        let targetAgentIds: string[] = [user.id];

        if (adminContext?.isAdmin && viewAsAgentId) {
          targetAgentIds = [viewAsAgentId];
        } else {
          const { data: assistantRel } = await supabase
            .from('agent_assistant_relationships')
            .select('agent_profile_id')
            .eq('assistant_profile_id', user.id)
            .maybeSingle();

          if (assistantRel?.agent_profile_id) {
            targetAgentIds = [user.id, assistantRel.agent_profile_id];
          }
        }

        const { data: apptData, error: apptErr } = await supabase
          .from('calendar_appointments')
          .select('*, client:clients(id, full_name, email, phone)')
          .in('agent_id', targetAgentIds)
          .order('starts_at', { ascending: true });

        if (apptErr) throw apptErr;

        fetchedAppointments = (apptData || []).map((appt: any) => {
          const parsed = parseAppointmentDescription(appt.description, appt.title);
          const isCancelled = appt.status === 'cancelled';
          const isCompleted = appt.status === 'completed';

          // Resolve CRM client matching by email (1 match, 0 matches, or >1 ambiguous matches)
          const primaryInviteeEmail = (
            parsed.invitees[0]?.email ||
            parsed.inviteeEmail?.split(',')[0] ||
            ''
          )
            .trim()
            .toLowerCase();
          const emailMatches = primaryInviteeEmail
            ? clientsByEmail.get(primaryInviteeEmail) || []
            : [];

          let clientMatchStatus: 'matched' | 'unmatched' | 'ambiguous' = 'unmatched';
          let resolvedClientId: string | null = appt.client_id || null;
          let resolvedClientName: string | null =
            appt.client?.full_name || (appt.client_id ? clientMap.get(appt.client_id)?.full_name : null) || null;
          let ambiguousClients: AmbiguousClientMatchInfo[] = parsed.ambiguousClients || [];

          if (parsed.matchStatus === 'ambiguous' || emailMatches.length > 1) {
            clientMatchStatus = 'ambiguous';
            // Do not auto-select a client when multiple CRM clients share the same email
            resolvedClientId = null;
            resolvedClientName = null;
            if (emailMatches.length > 1) {
              ambiguousClients = emailMatches;
            }
          } else if (resolvedClientId && resolvedClientName) {
            clientMatchStatus = 'matched';
          } else if (emailMatches.length === 1) {
            clientMatchStatus = 'matched';
            resolvedClientId = emailMatches[0].id;
            resolvedClientName = emailMatches[0].full_name;
          } else {
            clientMatchStatus = 'unmatched';
          }

          let bg = '#3b82f6';
          let border = '#2563eb';

          if (isCancelled) {
            bg = '#ef4444'; // Red background for cancelled appointments
            border = '#dc2626'; // Darker red border
          } else if (isCompleted) {
            bg = '#10b981';
            border = '#059669';
          }

          const displayTitle = formatCalendarAppointmentDisplayTitle({
            rawTitle: appt.title,
            parsed,
            clientName: resolvedClientName,
            isCancelled,
          });

          const cleanModalTitle = displayTitle.replace(/^\[Cancelada\]\s*/i, '');

          return {
            id: `appointment-${appt.id}`,
            title: displayTitle,
            start: appt.starts_at,
            end: appt.ends_at,
            allDay: false,
            backgroundColor: bg,
            borderColor: border,
            textColor: '#ffffff',
            className: isCancelled ? 'opacity-90 font-medium' : '',
            extendedProps: {
              eventType: 'appointment',
              appointmentId: appt.id,
              title: cleanModalTitle,
              clientId: resolvedClientId,
              clientName: resolvedClientName,
              description: appt.description,
              location: appt.location,
              startsAt: appt.starts_at,
              endsAt: appt.ends_at,
              status: appt.status,
              isCalendly: parsed.isCalendly,
              source: parsed.source,
              bookedBy: parsed.bookedBy || resolvedClientName || null,
              inviteeEmail: parsed.inviteeEmail || null,
              appointmentTypeName: parsed.eventName || appt.title || null,
              invitees: parsed.invitees,
              clientMatchStatus,
              ambiguousClients,
            } as ExtendedCalendarEventProps,
          };
        });
      } catch (err: any) {
        console.error('Error loading appointments:', err);
        setAppointmentError('Could not load appointments: ' + (err?.message || 'Database query failed.'));
      }

      setEvents([...fetchedExpirations, ...fetchedAppointments]);
      await loadCalendlyStatus(viewAsAgentId);
    } catch (err: any) {
      console.error('Error initializing calendar:', err);
      setError(err?.message || 'Failed to initialize calendar.');
    } finally {
      setLoading(false);
    }
  }, [adminContext, viewAsAgentId, loadCalendlyStatus]);

  useEffect(() => {
    loadAdminContext();
  }, [loadAdminContext]);

  useEffect(() => {
    const saved = localStorage.getItem('smartrack:calendly_last_sync');
    if (saved) {
      setLastSyncTime(saved);
    }
  }, []);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  const handleOpenNewAppointment = (defaultStart?: Date) => {
    setFormError(null);
    setFormAppointmentId(null);
    setFormTitle('');
    setFormClientId('');
    setFormLocation('');
    setFormDescription('');
    setFormTechnicalBlock(null);
    setFormStatus('scheduled');

    const start = defaultStart || new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const startExt = extractUsDateAnd12hTime(start);
    const endExt = extractUsDateAnd12hTime(end);

    setFormStartDateUs(startExt.dateUs);
    setFormStartHour(startExt.hour12);
    setFormStartMinute(startExt.minute);
    setFormStartAmPm(startExt.ampm);

    setFormEndDateUs(endExt.dateUs);
    setFormEndHour(endExt.hour12);
    setFormEndMinute(endExt.minute);
    setFormEndAmPm(endExt.ampm);

    setIsNewAppointmentOpen(true);
  };

  const handleOpenEditAppointment = (props: ExtendedCalendarEventProps) => {
    setFormError(null);
    setFormAppointmentId(props.appointmentId || null);
    setFormTitle(props.title || props.clientName || '');
    setFormClientId(props.clientId || '');
    setFormLocation(props.location || '');
    
    // Parse description to hide technical metadata while editing
    const parsed = parseAppointmentDescription(props.description);
    setFormDescription(parsed.userNotes);
    setFormTechnicalBlock(parsed.rawTechnicalBlock || null);
    setFormStatus(props.status || 'scheduled');

    if (props.startsAt) {
      const startExt = extractUsDateAnd12hTime(props.startsAt);
      setFormStartDateUs(startExt.dateUs);
      setFormStartHour(startExt.hour12);
      setFormStartMinute(startExt.minute);
      setFormStartAmPm(startExt.ampm);
    }

    if (props.endsAt) {
      const endExt = extractUsDateAnd12hTime(props.endsAt);
      setFormEndDateUs(endExt.dateUs);
      setFormEndHour(endExt.hour12);
      setFormEndMinute(endExt.minute);
      setFormEndAmPm(endExt.ampm);
    }

    setSelectedAppointment(null);
    setIsNewAppointmentOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }

    // Validate and parse Start Date & Time
    const startDate = parseUsDateAnd12hTimeToDate(
      formStartDateUs,
      formStartHour,
      formStartMinute,
      formStartAmPm
    );

    if (!startDate) {
      setFormError('Start Date is invalid. Please enter a valid date in MM/DD/YYYY format (e.g. 07/27/2026).');
      return;
    }

    // Validate and parse End Date & Time
    const endDate = parseUsDateAnd12hTimeToDate(
      formEndDateUs,
      formEndHour,
      formEndMinute,
      formEndAmPm
    );

    if (!endDate) {
      setFormError('End Date is invalid. Please enter a valid date in MM/DD/YYYY format (e.g. 07/27/2026).');
      return;
    }

    if (endDate <= startDate) {
      setFormError('End date and time must be later than start date and time.');
      return;
    }

    setFormSaving(true);
    try {
      // Re-attach technical block if preserved to protect Calendly idempotency
      let finalDescription = formDescription.trim();
      if (formTechnicalBlock) {
        finalDescription = finalDescription
          ? `${finalDescription}${formTechnicalBlock}`
          : formTechnicalBlock.trim();
      }

      if (formAppointmentId) {
        const { error: updateErr } = await supabase
          .from('calendar_appointments')
          .update({
            client_id: formClientId.trim() ? formClientId : null,
            title: formTitle.trim(),
            description: finalDescription || null,
            location: formLocation.trim() || null,
            starts_at: startDate.toISOString(),
            ends_at: endDate.toISOString(),
            status: formStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', formAppointmentId);

        if (updateErr) throw updateErr;
        flashNotice('Appointment updated successfully.');
      } else {
        const targetAgentId = adminContext?.isAdmin && viewAsAgentId ? viewAsAgentId : currentUser.id;
        const payload: any = {
          agent_id: targetAgentId,
          client_id: formClientId.trim() ? formClientId : null,
          title: formTitle.trim(),
          description: finalDescription || null,
          location: formLocation.trim() || null,
          starts_at: startDate.toISOString(),
          ends_at: endDate.toISOString(),
          status: formStatus,
        };

        const { error: insertErr } = await supabase
          .from('calendar_appointments')
          .insert(payload);

        if (insertErr) throw insertErr;
        flashNotice('New appointment created successfully.');
      }

      setIsNewAppointmentOpen(false);
      await loadCalendarData();
    } catch (err: any) {
      console.error('Error saving appointment:', err);
      setFormError(err?.message || 'Failed to save appointment.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;

    try {
      const { error: delErr } = await supabase
        .from('calendar_appointments')
        .delete()
        .eq('id', appointmentId);

      if (delErr) throw delErr;

      setSelectedAppointment(null);
      flashNotice('Appointment deleted successfully.');
      await loadCalendarData();
    } catch (err: any) {
      console.error('Error deleting appointment:', err);
      setError(err?.message || 'Failed to delete appointment.');
    }
  };

  const handleEventClick = (info: any) => {
    const props = info.event.extendedProps as ExtendedCalendarEventProps;

    if (props.eventType === 'policy_expiration') {
      setSelectedExpiration(props);
    } else if (props.eventType === 'appointment') {
      setSelectedAppointment(props);
    }
  };

  const handleDateSelect = (selectInfo: any) => {
    handleOpenNewAppointment(selectInfo.start);
  };

  const targetAgentDisplay = viewAsAgentId
    ? (viewAsAgentId === adminContext?.targetAgent?.id
        ? adminContext?.targetAgent
        : adminContext?.availableAgents?.find((a) => a.id === viewAsAgentId) || {
            id: viewAsAgentId,
            name: 'Loni Oliveira De Souza',
            email: 'lonisouzainvest@gmail.com',
          })
    : null;

  if (!mounted) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calendar</h1>
              <p className="text-sm text-slate-500">Manage your appointments and policy expirations</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-sm text-center text-xs font-semibold text-slate-400">
            Loading schedule...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <CrmPageContainer>
        {/* Flash Notification Banner */}
        {notice && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-medium text-sm flex items-center justify-between shadow-sm animate-fadeIn">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Close"
              className="text-emerald-500 hover:text-emerald-700 font-bold ml-4 p-1 rounded-lg hover:bg-emerald-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Close"
              className="text-rose-500 hover:text-rose-700 font-bold ml-4 p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Source-specific Error Banners */}
        {policyError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>⚠️ {policyError}</span>
            <button
              type="button"
              onClick={() => setPolicyError(null)}
              aria-label="Close"
              className="text-amber-600 hover:text-amber-800 font-bold ml-4 p-1 rounded-lg hover:bg-amber-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {appointmentError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>⚠️ {appointmentError}</span>
            <button
              type="button"
              onClick={() => setAppointmentError(null)}
              aria-label="Close"
              className="text-amber-600 hover:text-amber-800 font-bold ml-4 p-1 rounded-lg hover:bg-amber-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Persistent "Viewing as Agent" Banner for Authorized Admins */}
        {adminContext?.isAdmin && viewAsAgentId && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-blue-500/15 border-2 border-amber-500/40 text-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-amber-500/30 shrink-0">
                👁️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Admin Preview Mode
                  </span>
                  <span className="text-xs text-slate-600 font-medium">
                    Authenticated actor: <span className="font-semibold text-slate-800">{adminContext.currentUserName || adminContext.currentUserEmail}</span>
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  Viewing calendar as <span className="text-indigo-700 font-bold underline">{targetAgentDisplay?.name || 'Loni Oliveira De Souza'}</span> ({targetAgentDisplay?.email || 'lonisouzainvest@gmail.com'})
                </p>
                <p className="text-xs text-slate-500">
                  Target Agent ID: <code className="bg-white/70 px-1 py-0.5 rounded text-[11px] text-slate-700">{targetAgentDisplay?.id}</code> &bull; Calendly sync and appointment actions are scoped to this agent and logged to the server audit trail.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <button
                type="button"
                onClick={handleExitViewAs}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 hover:border-slate-400 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Return to my account
              </button>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calendar</h1>
              <p className="text-sm text-slate-500">Manage your appointments and policy expirations</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Admin "View As Agent" Dropdown Selector */}
            {adminContext?.isAdmin && (
              <div className="flex items-center gap-2 bg-indigo-50/80 border border-indigo-200/80 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-semibold text-indigo-900 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View as:
                </span>
                <select
                  value={viewAsAgentId || ''}
                  onChange={(e) => handleSwitchViewAs(e.target.value || null)}
                  className="text-xs bg-white border border-indigo-200 rounded-lg px-2 py-1 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">My Own Account</option>
                  <option value="d1c696ef-c77d-4b2b-a3f5-83acd965c363">Loni Oliveira De Souza (Target Agent)</option>
                  {(adminContext.availableAgents || [])
                    .filter((a) => a.id !== 'd1c696ef-c77d-4b2b-a3f5-83acd965c363')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.email})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {calendlyStatus?.isAuthorized && (
              <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-xl text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      calendlyStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  ></span>
                  <span className="font-semibold text-slate-700">
                    {calendlyStatus.connected
                      ? `Calendly: ${calendlyStatus.calendlyUserName || 'Loni Souza'}`
                      : 'Calendly: Ready'}
                  </span>
                </div>
                {lastSyncTime && (
                  <span className="text-[10px] text-slate-400 border-l border-slate-200 pl-2">
                    Synced: {formatTimestampToUsDateTime(lastSyncTime)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSyncCalendly}
                  disabled={calendlySyncing}
                  className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${calendlySyncing ? 'animate-spin' : ''}`}
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
                  {calendlySyncing ? 'Syncing...' : 'Sync Calendly'}
                </button>
              </div>
            )}

            {/* Compact "Mostrar canceladas" toggle control */}
            <button
              type="button"
              onClick={handleToggleShowCancelled}
              aria-pressed={showCancelled}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                showCancelled
                  ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-sm ring-1 ring-rose-200'
                  : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  showCancelled ? 'bg-rose-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
              <span>Mostrar canceladas</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  showCancelled ? 'bg-rose-100 text-rose-800 font-bold' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {showCancelled ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              onClick={() => handleOpenNewAppointment()}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-medium text-sm transition-all duration-200 shadow-md shadow-blue-500/20 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Appointment
            </button>
          </div>
        </div>

        {/* Legend Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-100/80 px-5 py-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm"></span>
              <span>Appointments</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block shadow-sm"></span>
              <span>Policy Expirations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${showCancelled ? 'bg-rose-500' : 'bg-slate-400'} inline-block shadow-sm`}></span>
              <span className={showCancelled ? 'text-rose-700 font-semibold' : 'line-through text-slate-400'}>
                Canceladas {showCancelled ? '(Visibles)' : '(Ocultas)'}
              </span>
            </div>
          </div>
          <span className="text-slate-400 italic">Click on any date to schedule an appointment</span>
        </div>

        {/* Calendar Body Container */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 min-h-[650px]">
          {loading ? (
            <div className="h-[600px] flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-slate-500">Loading calendar appointments and expirations...</p>
            </div>
          ) : (
            <div className="fullcalendar-wrapper">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
                }}
                buttonText={{
                  today: 'Today',
                  month: 'Month',
                  week: 'Week',
                  day: 'Day',
                  list: 'List',
                }}
                locale="en"
                firstDay={0}
                selectable={true}
                select={handleDateSelect}
                events={events.filter((evt) => {
                  if (evt.extendedProps?.eventType === 'appointment') {
                    if (!showCancelled && evt.extendedProps?.status === 'cancelled') {
                      return false;
                    }
                  }
                  return true;
                })}
                eventClick={handleEventClick}
                eventTimeFormat={{
                  hour: 'numeric',
                  minute: '2-digit',
                  meridiem: 'short',
                  hour12: true,
                }}
                slotLabelFormat={{
                  hour: 'numeric',
                  minute: '2-digit',
                  meridiem: 'short',
                  hour12: true,
                }}
                height="auto"
                aspectRatio={1.6}
              />
            </div>
          )}
        </div>
      </CrmPageContainer>

      {/* ========================================================================= */}
      {/* 1. NEW / EDIT APPOINTMENT MODAL                                           */}
      {/* ========================================================================= */}
      {isNewAppointmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-100 animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-lg">
                {formAppointmentId ? 'Edit Appointment' : 'New Appointment'}
              </h3>
              <button
                type="button"
                onClick={() => setIsNewAppointmentOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveAppointment} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Policy Review Meeting"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Client <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                >
                  <option value="">-- No Client Linked --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date & Start Time Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <DatePicker
                    label="Start Date"
                    required
                    value={formStartDateUs}
                    onChange={(iso) => {
                      if (iso) {
                        const parts = iso.split('-');
                        setFormStartDateUs(`${parts[1]}/${parts[2]}/${parts[0]}`);
                      } else {
                        setFormStartDateUs('');
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Start Time <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={formStartHour}
                      onChange={(e) => setFormStartHour(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {HOURS_12.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formStartMinute}
                      onChange={(e) => setFormStartMinute(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formStartAmPm}
                      onChange={(e) => setFormStartAmPm(e.target.value as 'AM' | 'PM')}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs font-semibold text-slate-900 outline-none transition-all"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* End Date & End Time Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <DatePicker
                    label="End Date"
                    required
                    value={formEndDateUs}
                    onChange={(iso) => {
                      if (iso) {
                        const parts = iso.split('-');
                        setFormEndDateUs(`${parts[1]}/${parts[2]}/${parts[0]}`);
                      } else {
                        setFormEndDateUs('');
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    End Time <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={formEndHour}
                      onChange={(e) => setFormEndHour(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {HOURS_12.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formEndMinute}
                      onChange={(e) => setFormEndMinute(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formEndAmPm}
                      onChange={(e) => setFormEndAmPm(e.target.value as 'AM' | 'PM')}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs font-semibold text-slate-900 outline-none transition-all"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as AppointmentStatus)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Location <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Office / Zoom / Phone"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Add details, agenda, or internal notes..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewAppointmentOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : formAppointmentId ? 'Update Appointment' : 'Create Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. POLICY EXPIRATION DETAIL MODAL                                         */}
      {/* ========================================================================= */}
      {selectedExpiration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 animate-scaleIn">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping inline-block"></span>
                <h3 className="font-bold text-base">Policy Expiration Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpiration(null)}
                aria-label="Close"
                className="text-white/80 hover:text-white font-bold p-1 rounded-lg hover:bg-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-700">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Client</span>
                  <span className="font-semibold text-slate-900">{selectedExpiration.clientName}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Policy Type</span>
                  <span className="font-semibold text-blue-600">{selectedExpiration.policyType}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Policy Number</span>
                  <span className="font-mono text-slate-800">{selectedExpiration.policyNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Carrier / Company</span>
                  <span className="text-slate-800">{selectedExpiration.company || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase font-semibold text-slate-500">Expiration Date</span>
                  <span className="font-bold text-red-600 font-mono">
                    {selectedExpiration.expirationDate
                      ? formatIsoToUsDate(selectedExpiration.expirationDate)
                      : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedExpiration(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Close
                </button>

                {selectedExpiration.clientId && selectedExpiration.policyId && (
                  <Link
                    href={`/clients/${selectedExpiration.clientId}/policies/${selectedExpiration.policyId}`}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all"
                  >
                    View Policy Details
                    <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. APPOINTMENT DETAIL MODAL                                                */}
      {/* ========================================================================= */}
      {selectedAppointment && (() => {
        const parsed = parseAppointmentDescription(
          selectedAppointment.description,
          selectedAppointment.title
        );
        const isCalendly = Boolean(selectedAppointment.isCalendly || parsed.isCalendly);
        const bookedByDisplay =
          selectedAppointment.bookedBy ||
          parsed.bookedBy ||
          selectedAppointment.clientName ||
          'Calendly Invitee';
        const inviteeEmailDisplay =
          selectedAppointment.inviteeEmail ||
          parsed.inviteeEmail ||
          'No email provided';
        const appointmentTypeDisplay =
          selectedAppointment.appointmentTypeName ||
          parsed.eventName ||
          selectedAppointment.title ||
          'Consultation';
        const sourceDisplay = isCalendly ? 'Calendly' : (selectedAppointment.source || 'CRM');
        const inviteeList =
          selectedAppointment.invitees && selectedAppointment.invitees.length > 0
            ? selectedAppointment.invitees
            : parsed.invitees;
        const matchStatus =
          selectedAppointment.clientMatchStatus ||
          parsed.matchStatus ||
          (selectedAppointment.clientId && selectedAppointment.clientName ? 'matched' : 'unmatched');
        const ambiguousClients =
          selectedAppointment.ambiguousClients && selectedAppointment.ambiguousClients.length > 0
            ? selectedAppointment.ambiguousClients
            : parsed.ambiguousClients;

        const meetingLocation = selectedAppointment.location || parsed.meetingUrl;
        const isMeetingUrl =
          meetingLocation &&
          (meetingLocation.startsWith('http://') || meetingLocation.startsWith('https://'));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-100 animate-scaleIn">
              <div
                className={`px-6 py-4 ${
                  selectedAppointment.status === 'cancelled' ? 'bg-rose-600' : 'bg-blue-600'
                } text-white flex items-center justify-between`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {selectedAppointment.status === 'cancelled' && (
                    <span className="px-2 py-0.5 rounded bg-white/20 text-xs font-bold uppercase tracking-wider shrink-0">
                      Cancelada
                    </span>
                  )}
                  <h3 className="font-bold text-base truncate">{selectedAppointment.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAppointment(null)}
                  aria-label="Close"
                  className="text-white/80 hover:text-white font-bold p-1 rounded-lg hover:bg-black/10 transition-colors shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm text-slate-700 max-h-[80vh] overflow-y-auto">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                  {/* Booked by */}
                  <div className="flex justify-between items-start gap-4 pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500 shrink-0">Booked by:</span>
                    <div className="text-right">
                      <span className="font-semibold text-slate-900" data-testid="modal-booked-by">
                        {bookedByDisplay}
                      </span>
                      {inviteeList && inviteeList.length > 1 && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          {inviteeList.length} Invitees
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex justify-between items-start gap-4 pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500 shrink-0">Email:</span>
                    <span className="font-mono text-xs text-slate-800 break-all text-right" data-testid="modal-invitee-email">
                      {inviteeEmailDisplay}
                    </span>
                  </div>

                  {/* Multiple Invitees Breakdown when >1 invitee */}
                  {inviteeList && inviteeList.length > 1 && (
                    <div className="p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-lg text-xs space-y-1">
                      <span className="font-bold text-indigo-950 block">Scheduled Event Invitees:</span>
                      <ul className="space-y-1">
                        {inviteeList.map((inv, idx) => (
                          <li key={idx} className="flex items-center justify-between text-indigo-900">
                            <span className="font-semibold">{inv.name}</span>
                            <span className="font-mono text-[11px] text-indigo-700">{inv.email || 'No email'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Appointment Type / Event Name */}
                  <div className="flex justify-between items-start gap-4 pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500 shrink-0">Appointment:</span>
                    <span className="font-semibold text-slate-900 text-right" data-testid="modal-appointment-type">
                      {appointmentTypeDisplay}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Date:</span>
                    <span className="font-medium text-slate-800 font-mono" data-testid="modal-appointment-date">
                      {formatTimestampToUsDateOnly(selectedAppointment.startsAt)}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Time:</span>
                    <span className="font-medium text-slate-800 font-mono" data-testid="modal-appointment-time">
                      {formatTimestampRangeToUsTime(selectedAppointment.startsAt, selectedAppointment.endsAt)}
                    </span>
                  </div>

                  {/* Source */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Source:</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isCalendly
                          ? 'bg-sky-100 text-sky-800 border border-sky-200'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                      data-testid="modal-appointment-source"
                    >
                      {sourceDisplay}
                    </span>
                  </div>

                  {/* CRM Client Matching Section */}
                  <div className="flex justify-between items-start gap-4 pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500 shrink-0">CRM Client:</span>
                    <div className="text-right">
                      {matchStatus === 'matched' &&
                      selectedAppointment.clientId &&
                      selectedAppointment.clientName ? (
                        <Link
                          href={`/clients/${selectedAppointment.clientId}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                          data-testid="modal-matched-client-link"
                        >
                          <span>{selectedAppointment.clientName}</span>
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      ) : matchStatus === 'ambiguous' ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold"
                          data-testid="modal-ambiguous-client-badge"
                        >
                          Ambiguous Email Match (Not Auto-Linked)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 font-medium" data-testid="modal-unmatched-client">
                          {bookedByDisplay}{' '}
                          <span className="text-[11px] text-slate-400">(No matching CRM client)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ambiguous Client Matches Warning Box */}
                  {matchStatus === 'ambiguous' && (
                    <div
                      className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1.5"
                      data-testid="modal-ambiguous-client-details"
                    >
                      <span className="font-bold block">
                        ⚠️ Multiple CRM clients match email ({inviteeEmailDisplay}):
                      </span>
                      <p className="text-[11px] text-amber-800">
                        To prevent linking the wrong record, no client was selected automatically. Invitee details are preserved above.
                      </p>
                      {ambiguousClients && ambiguousClients.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5 pt-1">
                          {ambiguousClients.map((c) => (
                            <li key={c.id} className="font-medium">
                              <Link
                                href={`/clients/${c.id}`}
                                className="text-amber-900 underline hover:text-blue-700"
                              >
                                {c.full_name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Status</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        selectedAppointment.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedAppointment.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-800 font-bold border border-rose-200'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {selectedAppointment.status === 'cancelled' ? 'Cancelada' : selectedAppointment.status}
                    </span>
                  </div>

                  {selectedAppointment.status === 'cancelled' && parsed.cancellationReason && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                      <span className="font-bold block mb-0.5">Motivo de Cancelación:</span>
                      <span>{parsed.cancellationReason}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Start Time</span>
                    <span className="font-medium text-slate-800 font-mono">
                      {formatTimestampToUsDateTime(selectedAppointment.startsAt)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">End Time</span>
                    <span className="font-medium text-slate-800 font-mono">
                      {formatTimestampToUsDateTime(selectedAppointment.endsAt)}
                    </span>
                  </div>

                  {meetingLocation && (
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="text-xs uppercase font-semibold text-slate-500">Meeting / Location</span>
                      {isMeetingUrl ? (
                        <a
                          href={meetingLocation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-sky-600 hover:text-sky-800 hover:underline flex items-center gap-1 max-w-[260px] truncate"
                        >
                          <span>
                            {meetingLocation.includes('google.com')
                              ? 'Google Meet Link'
                              : meetingLocation.includes('calendly.com')
                              ? 'Calendly Meeting Link'
                              : 'Join Meeting'}
                          </span>
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-slate-800">{meetingLocation}</span>
                      )}
                    </div>
                  )}

                  {parsed.userNotes && (
                    <div className="pt-1">
                      <span className="text-xs uppercase font-semibold text-slate-500 block mb-1">Notes / Questionnaire</span>
                      <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {parsed.userNotes}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      selectedAppointment.appointmentId &&
                      handleDeleteAppointment(selectedAppointment.appointmentId)
                    }
                    className="px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    Delete Appointment
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAppointment(null)}
                      className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditAppointment(selectedAppointment)}
                      className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all"
                    >
                      Edit Appointment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
