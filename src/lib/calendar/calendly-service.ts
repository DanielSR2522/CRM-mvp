import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { AMANDA_UUID, LAURA_UUID } from '@/lib/auth/agentDisplay';

// Verified Loni CRM Agent ID and email
export const LONI_CRM_AGENT_ID = 'd1c696ef-c77d-4b2b-a3f5-83acd965c363';
export const LONI_CRM_AGENT_EMAIL = 'lonisouzainvest@gmail.com';

export interface CalendlyUserInfo {
  uri: string;
  name: string;
  email: string;
  schedulingUrl?: string;
  timezone?: string;
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  scheduling_url: string;
  slug: string;
  active: boolean;
  duration?: number;
}

export interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled';
  start_time: string;
  end_time: string;
  event_type: string;
  location?: {
    type: string;
    location?: string | null;
    join_url?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  event_memberships?: Array<{
    user: string;
    user_email: string;
    user_name: string;
  }>;
}

export interface CalendlyInvitee {
  uri: string;
  email: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  status: 'active' | 'canceled';
  rescheduled: boolean;
  old_invitee?: string | null;
  new_invitee?: string | null;
  cancel_url?: string;
  reschedule_url?: string;
  created_at: string;
  updated_at: string;
  cancellation?: {
    canceled_by: string;
    reason: string;
  } | null;
  questions_and_answers?: Array<{
    question: string;
    answer: string;
  }>;
}

export interface CalendlyAmbiguousMatchReport {
  inviteeName: string;
  inviteeEmail: string;
  eventUri: string;
  matchingClients: Array<{ id: string; full_name: string; email: string }>;
}

export interface CalendlySyncResult {
  success: boolean;
  syncedCount: number;
  newCount: number;
  updatedCount: number;
  cancelledCount: number;
  newlyCancelledCount: number;
  unmatchedClientsCount: number;
  matchedClientsCount: number;
  ambiguousClientsCount: number;
  ambiguousMatches?: CalendlyAmbiguousMatchReport[];
  eventName: string;
  targetEventUrl: string;
  lastSync: string;
  error?: string;
}

/**
 * Resolves the clean invitee display name from Calendly invitee payload.
 */
export function resolveCalendlyInviteeName(
  invitee: Partial<CalendlyInvitee>,
  fallbackName = 'Calendly Invitee'
): string {
  const direct = (invitee.name || '').trim().replace(/\s+/g, ' ');
  if (direct) return direct;

  const combined = [invitee.first_name, invitee.last_name]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
  if (combined) return combined;

  const emailPrefix = (invitee.email || '').trim().split('@')[0];
  if (emailPrefix) return emailPrefix;

  return fallbackName;
}

/**
 * Cleans and normalizes the Calendly event type / scheduled event name.
 */
export function cleanCalendlyEventName(
  rawName?: string | null,
  fallback = 'Consultation'
): string {
  const cleaned = (rawName || '').trim().replace(/\s+/g, ' ');
  return cleaned || fallback;
}

/**
 * Formats the CRM calendar appointment title as:
 * "Maria Gonzalez — Medicare Consultation"
 */
export function formatCalendlyAppointmentTitle(
  personName: string,
  eventName: string
): string {
  const cleanPerson = (personName || '').trim().replace(/\s+/g, ' ') || 'Calendly Invitee';
  const cleanEvent = cleanCalendlyEventName(eventName);
  return `${cleanPerson} — ${cleanEvent}`;
}

export interface AuthorizationResult {
  authorized: boolean;
  isAdmin: boolean;
  isAssistant: boolean;
  isDirectAgent: boolean;
  actorProfileId: string;
  actorEmail?: string;
  actorName?: string;
  targetAgentId: string;
  targetAgentName?: string;
  reason?: string;
}

/**
 * Structured audit logger for administrative & agent calendar actions.
 */
export function logCalendarAuditAction(params: {
  action: 'VIEW_CALENDAR' | 'VIEW_CALENDLY_STATUS' | 'SYNC_CALENDLY' | 'EDIT_APPOINTMENT' | 'CREATE_APPOINTMENT';
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetAgentId: string;
  targetAgentName?: string;
  details?: Record<string, any>;
}) {
  const timestamp = new Date().toISOString();
  console.log(
    `[AUDIT_LOG] [CALENDAR] [${timestamp}] action=${params.action} actorId=${params.actorUserId} actorEmail=${params.actorEmail || 'N/A'} actorRole=${params.actorRole || 'admin'} targetAgentId=${params.targetAgentId} targetAgentName="${params.targetAgentName || 'N/A'}" details=${JSON.stringify(params.details || {})}`
  );
}

/**
 * Returns the server-only Calendly access token.
 */
function getCalendlyAccessToken(): string {
  const token = process.env.CALENDLY_ACCESS_TOKEN;
  if (!token) {
    throw new Error('CALENDLY_ACCESS_TOKEN environment variable is not configured.');
  }
  return token;
}

/**
 * Returns the configured target event URL.
 */
export function getCalendlyTargetEventUrl(): string {
  const url = process.env.CALENDLY_EVENT_URL || 'https://calendly.com/lonisouza/the-best-health-plan-for-your-family-with-loni-souza';
  return url.trim();
}

/**
 * Verifies Calendly identity via /users/me and checks that it belongs to Loni.
 */
export async function verifyCalendlyUser(): Promise<CalendlyUserInfo> {
  const token = getCalendlyAccessToken();
  const res = await fetch('https://api.calendly.com/users/me', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to verify Calendly authentication (HTTP ${res.status}): ${errText || 'Invalid token'}`);
  }

  const data = await res.json();
  const user = data.resource;
  if (!user || !user.uri) {
    throw new Error('Malformed user payload from Calendly API.');
  }

  return {
    uri: user.uri,
    name: user.name || 'Loni Oliveira De Souza',
    email: user.email,
    schedulingUrl: user.scheduling_url,
    timezone: user.timezone,
  };
}

/**
 * Resolves the exact event type matching CALENDLY_EVENT_URL.
 */
export async function resolveCalendlyEventType(userUri: string): Promise<CalendlyEventType> {
  const token = getCalendlyAccessToken();
  const targetUrl = getCalendlyTargetEventUrl().toLowerCase();

  const res = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch event types from Calendly (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const collection: CalendlyEventType[] = data.collection || [];

  const matched = collection.find((et) => {
    const schedUrl = (et.scheduling_url || '').toLowerCase();
    const slug = (et.slug || '').toLowerCase();
    return schedUrl === targetUrl || targetUrl.includes(slug);
  });

  if (!matched) {
    throw new Error(
      `Could not find target event type matching "${getCalendlyTargetEventUrl()}". Found ${collection.length} other event types on account.`
    );
  }

  return matched;
}

/**
 * Fetches all scheduled events for the resolved event type, handling pagination.
 */
export async function fetchScheduledEventsForType(
  userUri: string,
  eventTypeUri: string
): Promise<Array<{ event: CalendlyScheduledEvent; invitees: CalendlyInvitee[] }>> {
  const token = getCalendlyAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const results: Array<{ event: CalendlyScheduledEvent; invitees: CalendlyInvitee[] }> = [];
  let nextUrl: string | null = `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(
    userUri
  )}&count=100&sort=start_time:desc`;

  let safetyLimit = 20; // up to 2000 events
  while (nextUrl && safetyLimit > 0) {
    safetyLimit--;
    const pageResponse: Response = await fetch(nextUrl, { headers, cache: 'no-store' });
    if (!pageResponse.ok) {
      console.error('[Calendly Sync] Error fetching scheduled events page:', pageResponse.status);
      break;
    }

    const pageData: any = await pageResponse.json();
    const collection: CalendlyScheduledEvent[] = pageData.collection || [];

    for (const ev of collection) {
      // Strict event type matching
      if (ev.event_type === eventTypeUri) {
        // Fetch all invitees for this scheduled event
        try {
          const invRes = await fetch(`${ev.uri}/invitees?count=100`, { headers, cache: 'no-store' });
          if (invRes.ok) {
            const invData = await invRes.json();
            const invitees: CalendlyInvitee[] = invData.collection || [];
            results.push({ event: ev, invitees });
          } else {
            results.push({ event: ev, invitees: [] });
          }
        } catch (invErr) {
          console.error(`[Calendly Sync] Error fetching invitees for event ${ev.uri}:`, invErr);
          results.push({ event: ev, invitees: [] });
        }
      }
    }

    nextUrl = pageData.pagination?.next_page || null;
  }

  return results;
}

/**
 * Verifies whether a given CRM actor user ID is authorized to access, view, or sync a target agent's calendar.
 * Strictly verifies admin role on server side.
 */
export async function checkUserCalendarAuthorization(
  actorUserId: string,
  targetAgentId: string = LONI_CRM_AGENT_ID
): Promise<AuthorizationResult> {
  const adminDb = getSupabaseAdmin();

  // Fetch actor profile
  const { data: actorProfile } = await adminDb
    .from('profiles')
    .select('id, email, name, first_name, last_name, role')
    .eq('id', actorUserId)
    .maybeSingle();

  const actorRole = (actorProfile?.role || '').toLowerCase();
  const isAdmin = actorUserId === AMANDA_UUID || actorUserId === LAURA_UUID || actorRole === 'admin';
  const isDirectAgent = actorUserId === targetAgentId;

  // Fetch target agent profile
  const { data: targetProfile } = await adminDb
    .from('profiles')
    .select('id, email, name, first_name, last_name, role')
    .eq('id', targetAgentId)
    .maybeSingle();

  const targetAgentName = targetProfile
    ? `${targetProfile.first_name || ''} ${targetProfile.last_name || ''}`.trim() || targetProfile.name || targetProfile.email
    : (targetAgentId === LONI_CRM_AGENT_ID ? 'Loni Oliveira De Souza' : 'Agent');

  const actorName = actorProfile
    ? `${actorProfile.first_name || ''} ${actorProfile.last_name || ''}`.trim() || actorProfile.name || actorProfile.email
    : 'User';

  // 1. Direct Agent Access
  if (isDirectAgent) {
    return {
      authorized: true,
      isAdmin,
      isAssistant: false,
      isDirectAgent: true,
      actorProfileId: actorUserId,
      actorEmail: actorProfile?.email,
      actorName,
      targetAgentId,
      targetAgentName,
    };
  }

  // 2. Administrator Access (View As Agent Mode)
  if (isAdmin) {
    return {
      authorized: true,
      isAdmin: true,
      isAssistant: false,
      isDirectAgent: false,
      actorProfileId: actorUserId,
      actorEmail: actorProfile?.email,
      actorName,
      targetAgentId,
      targetAgentName,
    };
  }

  // 3. Assistant Relationship Check
  const { data: rel } = await adminDb
    .from('agent_assistant_relationships')
    .select('id')
    .eq('agent_profile_id', targetAgentId)
    .eq('assistant_profile_id', actorUserId)
    .maybeSingle();

  if (rel) {
    return {
      authorized: true,
      isAdmin: false,
      isAssistant: true,
      isDirectAgent: false,
      actorProfileId: actorUserId,
      actorEmail: actorProfile?.email,
      actorName,
      targetAgentId,
      targetAgentName,
    };
  }

  // 4. Unauthorized
  return {
    authorized: false,
    isAdmin: false,
    isAssistant: false,
    isDirectAgent: false,
    actorProfileId: actorUserId,
    actorEmail: actorProfile?.email,
    actorName,
    targetAgentId,
    targetAgentName,
    reason: 'Forbidden: Only the target agent, assigned assistants, or authorized administrators can access this calendar context.',
  };
}

/**
 * Backward-compatible helper for sync authorization.
 */
export async function checkUserSyncAuthorization(
  userId: string,
  targetAgentId: string = LONI_CRM_AGENT_ID
): Promise<{ authorized: boolean; reason?: string }> {
  const result = await checkUserCalendarAuthorization(userId, targetAgentId);
  return {
    authorized: result.authorized,
    reason: result.reason,
  };
}

/**
 * Performs full idempotent synchronization of Calendly bookings into calendar_appointments.
 * When run by an administrator in "View as Agent" mode, the appointments remain owned by the target agent (Loni),
 * and the administrator's triggering action is logged to the server audit trail.
 */
export async function performCalendlySync(
  triggeringUserId: string,
  targetAgentId: string = LONI_CRM_AGENT_ID
): Promise<CalendlySyncResult> {
  // 1. Check Authorization
  const auth = await checkUserCalendarAuthorization(triggeringUserId, targetAgentId);
  if (!auth.authorized) {
    throw new Error(auth.reason || 'Unauthorized to sync Calendly.');
  }

  // 2. Audit Log
  logCalendarAuditAction({
    action: 'SYNC_CALENDLY',
    actorUserId: auth.actorProfileId,
    actorEmail: auth.actorEmail,
    actorRole: auth.isAdmin ? 'admin' : (auth.isAssistant ? 'assistant' : 'agent'),
    targetAgentId,
    targetAgentName: auth.targetAgentName,
    details: {
      mode: auth.isAdmin ? 'admin_view_as_agent' : 'standard',
    },
  });

  // 3. Verify Calendly User & Target Event
  const user = await verifyCalendlyUser();
  const eventType = await resolveCalendlyEventType(user.uri);

  // 4. Fetch Bookings
  const eventItems = await fetchScheduledEventsForType(user.uri, eventType.uri);

  const adminDb = getSupabaseAdmin();

  // 5. Fetch target agent's authorized clients for normalized email matching
  const { data: targetClients } = await adminDb
    .from('clients')
    .select('id, full_name, email')
    .eq('agent_id', targetAgentId);

  // Group clients by normalized email to distinguish 1 match vs 0 matches vs >1 ambiguous matches
  const clientsByEmail = new Map<string, Array<{ id: string; full_name: string; email: string }>>();

  (targetClients || []).forEach((c) => {
    if (c.email) {
      const norm = c.email.trim().toLowerCase();
      if (!norm) return;
      const list = clientsByEmail.get(norm) || [];
      list.push({ id: c.id, full_name: c.full_name, email: c.email });
      clientsByEmail.set(norm, list);
    }
  });

  // 6. Fetch existing calendar appointments for target agent to ensure idempotency
  const { data: existingAppts } = await adminDb
    .from('calendar_appointments')
    .select('*')
    .eq('agent_id', targetAgentId);

  const existingList = existingAppts || [];

  let newCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;
  let newlyCancelledCount = 0;
  let matchedClientsCount = 0;
  let unmatchedClientsCount = 0;
  let ambiguousClientsCount = 0;
  const ambiguousMatches: CalendlyAmbiguousMatchReport[] = [];

  for (const item of eventItems) {
    const { event, invitees } = item;
    const cleanEventName = cleanCalendlyEventName(event.name || eventType.name);

    // Handle each invitee (Calendly events can have 1 or more invitees)
    const targets: CalendlyInvitee[] =
      invitees.length > 0
        ? invitees
        : [
            {
              uri: `${event.uri}/invitees/default`,
              name: 'Calendly Invitee',
              email: '',
              status: event.status,
              rescheduled: false,
              created_at: event.created_at,
              updated_at: event.updated_at,
            },
          ];

    // If an event has multiple invitees, prepare a co-invitee summary so all invitees on the event are associated
    const allEventInviteesFormatted =
      targets.length > 1
        ? targets
            .map((inv) => {
              const nm = resolveCalendlyInviteeName(inv);
              const em = (inv.email || '').trim();
              return em ? `${nm} <${em}>` : nm;
            })
            .join('; ')
        : '';

    for (const invitee of targets) {
      const inviteeName = resolveCalendlyInviteeName(invitee, 'Calendly Invitee');
      const inviteeEmailRaw = (invitee.email || '').trim();
      const inviteeEmailNorm = inviteeEmailRaw.toLowerCase();

      // Match client against existing CRM clients using email:
      // - Exact 1 match: link client
      // - 0 matches: do not create client, leave unmatched
      // - >1 matches: do not auto-select client, preserve invitee info and report ambiguity
      const emailMatches = inviteeEmailNorm ? clientsByEmail.get(inviteeEmailNorm) || [] : [];
      let matchedClientId: string | null = null;
      let matchStatus: 'matched' | 'unmatched' | 'ambiguous' = 'unmatched';

      if (emailMatches.length === 1) {
        matchedClientId = emailMatches[0].id;
        matchStatus = 'matched';
        matchedClientsCount++;
      } else if (emailMatches.length > 1) {
        matchedClientId = null;
        matchStatus = 'ambiguous';
        ambiguousClientsCount++;
        unmatchedClientsCount++;
        ambiguousMatches.push({
          inviteeName,
          inviteeEmail: inviteeEmailRaw,
          eventUri: event.uri,
          matchingClients: emailMatches,
        });
      } else {
        matchedClientId = null;
        matchStatus = 'unmatched';
        unmatchedClientsCount++;
      }

      // Location resolution
      const locationStr =
        event.location?.join_url ||
        event.location?.location ||
        (event.location?.type ? `Calendly (${event.location.type})` : 'Calendly Meeting');

      // Status resolution: cancelled if event or invitee is cancelled/rescheduled
      const isCancelled =
        event.status === 'canceled' ||
        invitee.status === 'canceled' ||
        invitee.rescheduled === true;

      const apptStatus = isCancelled ? 'cancelled' : 'scheduled';
      if (isCancelled) cancelledCount++;

      // Formulate durable description containing Calendly metadata
      const qaFormatted = (invitee.questions_and_answers || [])
        .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
        .join('\n\n');

      const cancellationDetails = invitee.cancellation?.reason
        ? `Cancellation Reason: ${invitee.cancellation.reason} (by ${invitee.cancellation.canceled_by || 'invitee'})`
        : '';

      const matchMetadataLines: string[] = [`Client Match Status: ${matchStatus}`];
      if (matchStatus === 'matched' && emailMatches[0]) {
        matchMetadataLines.push(`Matched Client: ${emailMatches[0].full_name} (${emailMatches[0].id})`);
      } else if (matchStatus === 'ambiguous') {
        matchMetadataLines.push(
          `Ambiguous Client Matches: ${emailMatches.map((m) => `${m.full_name} (${m.id})`).join(' | ')}`
        );
      }

      const description = [
        qaFormatted,
        '---',
        '[Calendly Integration Details]',
        'Source: Calendly',
        `Event: ${cleanEventName}`,
        `Booked By: ${inviteeName}`,
        `Invitee Email: ${inviteeEmailRaw || 'No email'}`,
        `Invitee: ${inviteeName} <${inviteeEmailRaw || 'No email'}>`,
        allEventInviteesFormatted ? `Event Invitees: ${allEventInviteesFormatted}` : '',
        ...matchMetadataLines,
        `Calendly Event URI: ${event.uri}`,
        `Calendly Invitee URI: ${invitee.uri}`,
        `Meeting Location: ${locationStr}`,
        cancellationDetails,
      ]
        .filter(Boolean)
        .join('\n');

      // Display appointments in the CRM calendar as: "Maria Gonzalez — Medicare Consultation"
      const title = formatCalendlyAppointmentTitle(inviteeName, cleanEventName);

      // Find existing appointment without letting multi-invitee events overwrite each other:
      // 1. Exact invitee URI match
      // 2. Rescheduled old_invitee URI match
      // 3. Event URI match ONLY if single-invitee event, default placeholder, or same invitee email
      // 4. Same start_time + same invitee email
      const existing = existingList.find((a) => {
        const desc = a.description || '';
        if (invitee.uri && desc.includes(invitee.uri)) return true;
        if (invitee.old_invitee && desc.includes(invitee.old_invitee)) return true;
        if (event.uri && desc.includes(event.uri)) {
          if (targets.length === 1) return true;
          if (desc.includes(`${event.uri}/invitees/default`)) return true;
          if (inviteeEmailNorm && desc.toLowerCase().includes(inviteeEmailNorm)) return true;
        }
        if (
          inviteeEmailNorm &&
          a.starts_at === event.start_time &&
          desc.toLowerCase().includes(inviteeEmailNorm)
        ) {
          return true;
        }
        return false;
      });

      if (existing) {
        if (existing.status !== 'cancelled' && apptStatus === 'cancelled') {
          newlyCancelledCount++;
        }

        // Preserve manual client links for unmatched invitees, but never auto-select when ambiguous
        const resolvedClientId =
          matchStatus === 'ambiguous'
            ? null
            : matchedClientId || existing.client_id || null;

        // Update existing record
        const { error: updateErr } = await adminDb
          .from('calendar_appointments')
          .update({
            title,
            description,
            location: locationStr,
            starts_at: event.start_time,
            ends_at: event.end_time,
            status: apptStatus,
            client_id: resolvedClientId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (!updateErr) {
          updatedCount++;
          existing.title = title;
          existing.description = description;
          existing.status = apptStatus;
          existing.client_id = resolvedClientId;
        } else {
          console.error('[Calendly Sync] Error updating existing appointment:', updateErr);
        }
      } else {
        if (apptStatus === 'cancelled') {
          newlyCancelledCount++;
        }

        // Insert new record
        const { data: insertedRow, error: insertErr } = await adminDb
          .from('calendar_appointments')
          .insert({
            agent_id: targetAgentId, // Explicitly bound to verified target agent ID (Loni)
            client_id: matchedClientId,
            title,
            description,
            location: locationStr,
            starts_at: event.start_time,
            ends_at: event.end_time,
            status: apptStatus,
            created_at: event.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .maybeSingle();

        if (!insertErr) {
          newCount++;
          if (insertedRow) {
            existingList.push(insertedRow);
          }
        } else {
          console.error('[Calendly Sync] Error inserting appointment:', insertErr);
        }
      }
    }
  }

  const lastSyncTime = new Date().toISOString();

  return {
    success: true,
    syncedCount: eventItems.length,
    newCount,
    updatedCount,
    cancelledCount,
    newlyCancelledCount,
    matchedClientsCount,
    unmatchedClientsCount,
    ambiguousClientsCount,
    ambiguousMatches,
    eventName: cleanCalendlyEventName(eventType.name),
    targetEventUrl: getCalendlyTargetEventUrl(),
    lastSync: lastSyncTime,
  };
}

