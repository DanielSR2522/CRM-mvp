'use client';

import React, { useEffect, useState } from 'react';
import { listConsentEvents } from '@/lib/consents/request-service';

/**
 * The audit trail for one consent.
 *
 * Read-only, and it must stay that way: signature_events has no UPDATE policy
 * and a trigger that rejects modification outright, including from the service
 * role. What is shown here is what happened.
 */

interface AuditEvent {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  request_created: 'Consent created',
  request_updated: 'Consent updated',
  request_sent: 'Consent sent',
  email_sent: 'Email sent',
  email_failed: 'Email failed',
  whatsapp_link_opened: 'WhatsApp opened',
  sms_link_opened: 'SMS opened',
  secure_link_copied: 'Secure link copied',
  document_viewed: 'Document viewed by client',
  consent_accepted: 'Electronic consent accepted',
  signature_started: 'Signature started',
  document_signed: 'Document signed',
  document_declined: 'Document declined',
  request_expired: 'Consent expired',
  request_cancelled: 'Consent cancelled',
  final_document_generated: 'Signed PDF generated',
  final_document_failed: 'Signed PDF failed',
  document_downloaded: 'Document downloaded',
  delivery_failed: 'Delivery failed',
  link_issued: 'Signing link issued',
  link_revoked: 'Signing link revoked',
};

/** Failures are worth spotting at a glance; signatures are worth celebrating. */
function toneFor(eventType: string): string {
  if (eventType.includes('failed') || eventType === 'document_declined') {
    return 'bg-rose-100 text-rose-600';
  }
  if (eventType === 'document_signed' || eventType === 'final_document_generated') {
    return 'bg-emerald-100 text-emerald-600';
  }
  if (eventType === 'request_cancelled' || eventType === 'request_expired' || eventType === 'link_revoked') {
    return 'bg-amber-100 text-amber-600';
  }
  return 'bg-slate-100 text-slate-500';
}

export default function ConsentAuditTrail({ requestId }: { requestId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listConsentEvents(requestId);
        if (cancelled) return;
        setEvents(rows as unknown as AuditEvent[]);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the audit trail.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
        <p className="text-xs text-rose-700 font-medium">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">No events recorded yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {events.map((event, i) => (
        <li key={event.id} className="relative pl-8 pb-4 last:pb-0">
          {/* Connector */}
          {i < events.length - 1 && (
            <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-100" aria-hidden="true" />
          )}
          <span
            className={`absolute left-0 top-1 w-[23px] h-[23px] rounded-full flex items-center justify-center ${toneFor(
              event.event_type
            )}`}
            aria-hidden="true"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          </span>

          <div>
            <p className="text-xs font-bold text-slate-800">
              {EVENT_LABELS[event.event_type] ?? event.event_type}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {formatTimestamp(event.created_at)}
              {event.channel && ` · ${event.channel}`}
            </p>

            {/*
              IP and user-agent are captured server-side for signing events. They
              are the evidence that a real person, on a real device, at a real
              moment, agreed to this.
            */}
            {(event.ip_address || event.user_agent) && (
              <p className="text-[10px] text-slate-400 mt-1 font-mono truncate" title={event.user_agent ?? ''}>
                {event.ip_address && <span>IP {event.ip_address}</span>}
                {event.ip_address && event.user_agent && ' · '}
                {event.user_agent && <span>{shortUserAgent(event.user_agent)}</span>}
              </p>
            )}

            {renderMetadata(event.metadata)}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Only the human-meaningful keys. Raw JSON in a UI is a dump, not a trail. */
function renderMetadata(metadata: Record<string, unknown>): React.ReactNode {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const bits: string[] = [];

  if (typeof metadata.from === 'string' && typeof metadata.to === 'string') {
    bits.push(`${metadata.from} → ${metadata.to}`);
  }
  if (typeof metadata.reason === 'string' && metadata.reason) {
    bits.push(metadata.reason);
  }
  if (Array.isArray(metadata.unresolved_variables) && metadata.unresolved_variables.length > 0) {
    bits.push(`${metadata.unresolved_variables.length} unfilled field(s)`);
  }
  if (metadata.document_regenerated === true) {
    bits.push('document regenerated with fresh data');
  }
  if (typeof metadata.template_version === 'number') {
    bits.push(`template v${metadata.template_version}`);
  }
  if (metadata.policy_attached === true) {
    bits.push('policy attached');
  }

  if (bits.length === 0) return null;

  return <p className="text-[10px] text-slate-500 mt-1">{bits.join(' · ')}</p>;
}

function shortUserAgent(ua: string): string {
  return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}
