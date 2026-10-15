'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { OperationsClientRecord, OperationsAppointmentItem } from '@/lib/operations/types';
import { formatUSPhone } from '@/lib/formatters/phone';

interface OperationsCustomerDrawerProps {
  client: OperationsClientRecord | null;
  onClose: () => void;
}

function formatUsDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Not available';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${mm}/${dd}/${yyyy} at ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function formatUsTimeRange(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return 'Not available';
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  };
  const s = formatTime(startIso);
  if (!endIso) return s;
  return `${s} – ${formatTime(endIso)}`;
}

function formatUsDateOnly(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Not available';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export default function OperationsCustomerDrawer({
  client,
  onClose,
}: OperationsCustomerDrawerProps) {
  const [showBookingPanel, setShowBookingPanel] = useState(false);

  if (!client) return null;

  const hasAnyAppointment = client.allAppointments.length > 0;
  const upcomingAppt: OperationsAppointmentItem | null = client.nextAppointment;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px] font-sans"
      role="dialog"
      aria-modal="true"
      aria-label={`Customer operational details for ${client.fullName}`}
      data-testid="operations-customer-drawer"
    >
      {/* Backdrop click to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Right-Side Slide-Over Drawer */}
      <aside className="w-full max-w-xl bg-white h-full border-l border-slate-200 shadow-xl flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className="text-base font-bold text-slate-900 truncate"
                data-testid="drawer-customer-name"
              >
                {client.fullName}
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded border border-slate-200 bg-slate-50 text-slate-600">
                {client.clientType || 'Personal'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              Client ID: {client.id}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            data-testid="drawer-close-button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
          {/* 1. Primary Contextual Actions Bar */}
          <div className="space-y-2.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Contextual Actions
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Link
                href={`/clients/${client.id}`}
                data-testid="drawer-action-open-profile"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors text-center"
              >
                <span>Open Customer Profile</span>
                <span>→</span>
              </Link>

              {hasAnyAppointment ? (
                <Link
                  href="/calendar"
                  data-testid="drawer-action-view-appointment"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs transition-colors text-center"
                >
                  <span>View Appointment</span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="drawer-action-view-appointment-disabled"
                  title="Customer has no recorded appointments to view"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 text-slate-400 border border-slate-200 font-semibold text-xs cursor-not-allowed"
                >
                  <span>View Appointment</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowBookingPanel((prev) => !prev)}
                data-testid="drawer-action-schedule-appointment"
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-semibold text-xs transition-colors cursor-pointer ${
                  showBookingPanel
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                }`}
              >
                <span>Schedule Appointment</span>
              </button>
            </div>

            {/* Phase 1 Disabled Future Integration Actions with Explicit Explanations */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <button
                  type="button"
                  disabled
                  data-testid="drawer-action-record-call"
                  className="w-full text-left font-semibold text-slate-400 cursor-not-allowed flex items-center justify-between"
                >
                  <span>Record Call</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-500">
                    Disabled
                  </span>
                </button>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Persistent call-log schema not yet configured in Phase 1.
                </p>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <button
                  type="button"
                  disabled
                  data-testid="drawer-action-send-booklet"
                  className="w-full text-left font-semibold text-slate-400 cursor-not-allowed flex items-center justify-between"
                >
                  <span>Send Booklet</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-500">
                    Disabled
                  </span>
                </button>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Digital booklet delivery integration not yet configured.
                </p>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <button
                  type="button"
                  disabled
                  data-testid="drawer-action-send-bot"
                  className="w-full text-left font-semibold text-slate-400 cursor-not-allowed flex items-center justify-between"
                >
                  <span>Send Qualification Bot</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-500">
                    Disabled
                  </span>
                </button>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Outbound WhatsApp bot dispatch disabled in Phase 1.
                </p>
              </div>
            </div>
          </div>

          {/* Optional Appointment Booking Architecture Panel (Section 11) */}
          {showBookingPanel && (
            <div
              className="p-4 rounded-xl border border-slate-300 bg-slate-50 space-y-3"
              data-testid="drawer-booking-readiness-panel"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    Appointment Booking &amp; Calendly Availability Status
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Target Customer: <span className="font-semibold text-slate-800">{client.fullName}</span> ({client.email || 'No email on file'})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBookingPanel(false)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 text-[11px] text-slate-600">
                <p className="font-medium text-slate-800">
                  Phase 1 Audit of Appointment Booking Capabilities:
                </p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>
                    <span className="font-semibold text-slate-800">Calendly Pull Sync:</span> Operational via{' '}
                    <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">
                      /api/calendar/calendly/sync
                    </code>{' '}
                    (links confirmed invitees by normalized email).
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">Live Calendly Slot Creation:</span> Not yet enabled. Current Calendly service reads scheduled events and invitees only; outbound Calendly reservation creation is disabled in Phase 1 to prevent simulated or unverified bookings.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">Native CRM Calendar:</span> You can view and manage the schedule directly in the CRM Calendar module.
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500">
                  External booking writes are disabled in Phase 1.
                </span>
                <Link
                  href="/calendar"
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors"
                >
                  Open CRM Calendar →
                </Link>
              </div>
            </div>
          )}

          {/* 2. Customer & Contact Information */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 bg-white">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
              Customer &amp; Contact Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <span className="block text-[11px] text-slate-400 font-medium">Assigned Agent</span>
                <span className="font-semibold text-slate-900" data-testid="drawer-assigned-agent">
                  {client.assignedAgentName}
                </span>
              </div>

              <div>
                <span className="block text-[11px] text-slate-400 font-medium">Phone Number</span>
                <span className="font-mono font-semibold text-slate-900" data-testid="drawer-phone">
                  {client.phone ? formatUSPhone(client.phone) : 'Not recorded'}
                </span>
              </div>

              <div>
                <span className="block text-[11px] text-slate-400 font-medium">Email Address</span>
                <span className="font-mono text-slate-900 break-all" data-testid="drawer-email">
                  {client.email || 'Not recorded'}
                </span>
              </div>

              <div>
                <span className="block text-[11px] text-slate-400 font-medium">Address</span>
                <span className="text-slate-800">
                  {client.address || 'Not recorded'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Insurance Categories & Active Portfolio Breakdown */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Insurance Categories ({client.policyCounts.total} Total Policies)
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" data-testid="drawer-insurance-categories">
              {client.policyFlags.hasHealth && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  Health ({client.policyCounts.health})
                </span>
              )}
              {client.policyFlags.hasLife && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Life ({client.policyCounts.life})
                </span>
              )}
              {client.policyFlags.hasMedicare && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                  Medicare ({client.policyCounts.medicare})
                </span>
              )}
              {client.policyFlags.hasSupplemental && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  Supplemental ({client.policyCounts.supplemental})
                </span>
              )}
              {client.policyFlags.hasPC && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  Property &amp; Casualty ({client.policyCounts.pc})
                </span>
              )}
              {client.categoriesList.length === 0 && (
                <span className="text-xs text-slate-400 font-medium">
                  No active policy categories linked
                </span>
              )}
            </div>

            {client.renewalMetadata.hasHealthRenewal && (
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Health Carrier / Plan</span>
                  <span className="font-semibold text-slate-800">
                    {client.renewalMetadata.healthCarrier || 'Not recorded'} —{' '}
                    {client.renewalMetadata.healthPlanName || 'Not recorded'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Persisted Renewal Note</span>
                  <span className="font-semibold text-slate-800">
                    {client.renewalMetadata.healthRenovationStatus ||
                      client.renewalMetadata.healthActionPending ||
                      'Not recorded'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 4. Upcoming Appointment */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Upcoming Appointment
              </h3>
              {upcomingAppt && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Source: {upcomingAppt.source}
                </span>
              )}
            </div>

            {upcomingAppt ? (
              <div className="space-y-2 pt-1" data-testid="drawer-upcoming-appointment">
                <div className="font-bold text-slate-900 text-xs">
                  {upcomingAppt.displayTitle}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Date</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatUsDateOnly(upcomingAppt.startsAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Time</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatUsTimeRange(upcomingAppt.startsAt, upcomingAppt.endsAt)}
                    </span>
                  </div>
                  {upcomingAppt.bookedBy && (
                    <div>
                      <span className="text-slate-400 block">Booked By</span>
                      <span className="font-semibold text-slate-800">{upcomingAppt.bookedBy}</span>
                    </div>
                  )}
                  {upcomingAppt.inviteeEmail && (
                    <div>
                      <span className="text-slate-400 block">Invitee Email</span>
                      <span className="font-mono text-slate-800 break-all">
                        {upcomingAppt.inviteeEmail}
                      </span>
                    </div>
                  )}
                </div>

                {upcomingAppt.meetingUrl && (
                  <div className="pt-1">
                    <a
                      href={upcomingAppt.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold text-xs"
                    >
                      <span>Open Meeting Link</span>
                      <span>↗</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2 text-slate-500" data-testid="drawer-no-upcoming-appointment">
                No upcoming scheduled appointment.
              </div>
            )}
          </div>

          {/* 5. Complete Appointment History */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Appointment History ({client.allAppointments.length})
              </h3>
            </div>

            {client.allAppointments.length === 0 ? (
              <p className="text-slate-500 py-1">No appointment history recorded for this customer.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {client.allAppointments.map((appt) => {
                  const badgeStyle =
                    appt.temporalState === 'upcoming'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : appt.temporalState === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : appt.temporalState === 'cancelled'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200';

                  const stateLabel =
                    appt.temporalState === 'upcoming'
                      ? 'Upcoming'
                      : appt.temporalState === 'completed'
                      ? 'Completed'
                      : appt.temporalState === 'cancelled'
                      ? 'Cancelled'
                      : 'Past Scheduled';

                  return (
                    <div key={appt.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-slate-900 truncate">
                          {appt.eventName || appt.displayTitle}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatUsDateTime(appt.startsAt)} &bull; {appt.source}
                        </div>
                        {appt.cancellationReason && (
                          <div className="text-[11px] text-rose-600">
                            Reason: {appt.cancellationReason}
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${badgeStyle}`}
                      >
                        {stateLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Contact History & Next Action (Honest Persisted State) */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
              Operational Contact &amp; Workflow Status
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] text-slate-400 font-medium">Contact Status</span>
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium"
                  data-testid="drawer-contact-status"
                >
                  Not recorded
                </span>
              </div>

              <div>
                <span className="block text-[11px] text-slate-400 font-medium">Next Action</span>
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium"
                  data-testid="drawer-next-action"
                >
                  Not recorded
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <div className="font-semibold text-slate-700">Contact History</div>
              <p>
                Not configured — Persistent call/contact history tracking is not yet enabled in the database schema.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
