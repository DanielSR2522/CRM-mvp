'use client';

import React, { useState, useEffect, useMemo } from 'react';
import NextLink from 'next/link';
import type {
  InsuranceCategory,
  OperationsAppointmentRecord,
  PendingReviewClassification,
} from '@/lib/operations/types';

export interface CrmCustomerOption {
  id: string;
  agentId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  categories: InsuranceCategory[];
}

interface OperationsAppointmentDrawerProps {
  appointment: OperationsAppointmentRecord | null;
  allAppointments: OperationsAppointmentRecord[];
  availableClients: CrmCustomerOption[];
  onClose: () => void;
  onSelectAppointment?: (appointmentId: string) => void;
  onConfirmLinkClient: (
    appointmentId: string,
    targetClientId: string,
    actionLabel?: string
  ) => Promise<{ success: boolean; error?: string }>;
  onUnlinkAppointment: (
    appointmentId: string,
    keepPendingOnly?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  isAdminView?: boolean;
  currentUserId?: string | null;
}

const CATEGORY_BADGE_STYLES: Record<
  InsuranceCategory,
  { label: string; className: string }
> = {
  health: {
    label: 'Health',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  life: {
    label: 'Life',
    className: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  medicare: {
    label: 'Medicare',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  supplemental: {
    label: 'Supplemental',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  pc: {
    label: 'P&C',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
};

const CLASSIFICATION_META: Record<
  PendingReviewClassification,
  {
    title: string;
    description: string;
    activeClass: string;
    inactiveClass: string;
  }
> = {
  existing_customer_candidate: {
    title: 'Existing Customer Candidate',
    description:
      'Matches an existing CRM customer by normalized full name, first + last name subset, or email handle.',
    activeClass: 'bg-blue-50/90 border-blue-300 text-blue-900',
    inactiveClass: 'bg-slate-50/60 border-slate-200 text-slate-400',
  },
  potential_new_customer: {
    title: 'Potential New Customer',
    description:
      'Invitee does not match an existing CRM profile by email or full name and may represent a new prospect.',
    activeClass: 'bg-emerald-50/90 border-emerald-300 text-emerald-900',
    inactiveClass: 'bg-slate-50/60 border-slate-200 text-slate-400',
  },
  possible_duplicate_appointment: {
    title: 'Possible Duplicate Appointment',
    description:
      'Multiple bookings exist for the same invitee or email address across adjacent or rescheduled time slots.',
    activeClass: 'bg-amber-50/90 border-amber-300 text-amber-900',
    inactiveClass: 'bg-slate-50/60 border-slate-200 text-slate-400',
  },
  family_member_booking: {
    title: 'Booking Made by a Family Member',
    description:
      'Shares a household email, corporate domain, or family surname with an existing CRM policyholder.',
    activeClass: 'bg-purple-50/90 border-purple-300 text-purple-900',
    inactiveClass: 'bg-slate-50/60 border-slate-200 text-slate-400',
  },
};

function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function formatEasternDateTime(iso: string): {
  fullDate: string;
  timeStr: string;
  tzLabel: string;
} {
  try {
    const d = new Date(iso);
    const fullDate = d.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    });
    return { fullDate, timeStr, tzLabel: 'ET (America/New_York)' };
  } catch {
    return { fullDate: iso, timeStr: '', tzLabel: 'ET' };
  }
}

export default function OperationsAppointmentDrawer({
  appointment,
  allAppointments,
  availableClients,
  onClose,
  onSelectAppointment,
  onConfirmLinkClient,
  onUnlinkAppointment,
  isAdminView = false,
  currentUserId = null,
}: OperationsAppointmentDrawerProps) {
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [selectedManualClientId, setSelectedManualClientId] = useState<string | null>(null);
  const [isEditingLink, setIsEditingLink] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Reset local interactive state whenever a different appointment is opened
  useEffect(() => {
    setManualSearchQuery('');
    setSelectedManualClientId(null);
    setIsEditingLink(false);
    setIsSubmitting(false);
    setStatusBanner(null);
  }, [appointment?.id]);

  // Filter existing CRM clients scoped to the appointment's agent
  const agentScopedClients = useMemo(() => {
    if (!appointment) return [];
    return availableClients.filter(
      (c) => !c.agentId || c.agentId === appointment.agentId
    );
  }, [availableClients, appointment]);

  // Compute manual search results
  const manualSearchResults = useMemo(() => {
    if (!appointment) return [];
    const normQuery = normalizeSearchText(manualSearchQuery);
    if (!normQuery) {
      // When search box is empty, show top 6 alphabetical existing customers (excluding currently linked client)
      return agentScopedClients
        .filter((c) => c.id !== appointment.resolvedClientId)
        .slice(0, 6);
    }

    const queryTokens = normQuery.split(' ').filter(Boolean);
    const digitsOnlyQuery = normQuery.replace(/\D/g, '');

    const scored: Array<{ client: CrmCustomerOption; score: number }> = [];

    for (const client of agentScopedClients) {
      const normName = normalizeSearchText(client.fullName);
      const normEmail = normalizeSearchText(client.email);
      const normPhone = (client.phone || '').replace(/\D/g, '');

      let score = 0;
      if (normName === normQuery) {
        score += 100;
      } else if (normName.startsWith(normQuery)) {
        score += 75;
      } else if (normName.includes(normQuery)) {
        score += 55;
      } else if (
        queryTokens.length > 1 &&
        queryTokens.every((tok) => normName.includes(tok))
      ) {
        score += 45;
      }

      if (normEmail && normEmail === normQuery) {
        score += 90;
      } else if (normEmail && normEmail.includes(normQuery)) {
        score += 40;
      }

      if (digitsOnlyQuery.length >= 3 && normPhone.includes(digitsOnlyQuery)) {
        score += 35;
      }

      if (client.id.toLowerCase().includes(normQuery)) {
        score += 30;
      }

      if (score > 0) {
        scored.push({ client, score });
      }
    }

    scored.sort(
      (a, b) => b.score - a.score || a.client.fullName.localeCompare(b.client.fullName)
    );
    return scored.slice(0, 8).map((s) => s.client);
  }, [appointment, agentScopedClients, manualSearchQuery]);

  if (!appointment) return null;

  const startFormatted = formatEasternDateTime(appointment.startsAt);
  const endFormatted = formatEasternDateTime(appointment.endsAt);

  const siblingDuplicates = allAppointments.filter((a) =>
    appointment.duplicateAppointmentIds.includes(a.id)
  );

  const calendarHref =
    isAdminView && currentUserId && appointment.agentId !== currentUserId
      ? `/calendar?viewAsAgent=${encodeURIComponent(appointment.agentId)}`
      : '/calendar';

  const selectedManualClient =
    agentScopedClients.find((c) => c.id === selectedManualClientId) || null;

  const handleConfirmClient = async (targetClientId: string, label?: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setStatusBanner(null);

    try {
      const result = await onConfirmLinkClient(appointment.id, targetClientId, label);
      if (!result.success) {
        setStatusBanner({
          type: 'error',
          message:
            result.error ||
            'Could not save appointment link in Supabase. Verify permissions and try again.',
        });
      } else {
        const targetClient = agentScopedClients.find((c) => c.id === targetClientId);
        setIsEditingLink(false);
        setSelectedManualClientId(null);
        setManualSearchQuery('');
        setStatusBanner({
          type: 'success',
          message: `Appointment successfully linked to CRM customer "${
            targetClient?.fullName || label || targetClientId
          }" and persisted in Supabase.`,
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: err?.message || 'Unexpected error while linking appointment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkOrKeepPending = async (keepPendingOnly: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setStatusBanner(null);

    try {
      const result = await onUnlinkAppointment(appointment.id, keepPendingOnly);
      if (!result.success) {
        setStatusBanner({
          type: 'error',
          message:
            result.error || 'Could not update Pending Review state in Supabase.',
        });
      } else {
        setIsEditingLink(false);
        setSelectedManualClientId(null);
        setStatusBanner({
          type: 'info',
          message: keepPendingOnly
            ? `Appointment "${appointment.bookingName}" remains in Pending Review for manual verification.`
            : `Customer link removed. Appointment "${appointment.bookingName}" returned to Pending Review.`,
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: err?.message || 'Unexpected error updating appointment status.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const showManualSearchPanel =
    appointment.isPendingReview || isEditingLink;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-[1px]">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-label="Close appointment drawer backdrop"
      />

      <aside
        data-testid="operations-appointment-drawer"
        className="relative z-10 w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Top Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                {appointment.source} Booking
              </span>
              {appointment.status === 'cancelled' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  Cancelled
                </span>
              ) : appointment.status === 'completed' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  Completed
                </span>
              ) : appointment.temporalState === 'upcoming' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Upcoming Scheduled
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                  Past Scheduled
                </span>
              )}

              {appointment.isPendingReview ? (
                <span
                  data-testid="drawer-header-reconciliation-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200"
                >
                  Pending Review
                </span>
              ) : appointment.isProposedPreview ? (
                <span
                  data-testid="drawer-header-reconciliation-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200"
                >
                  Exact-Name Match (Awaiting Confirmation)
                </span>
              ) : (
                <span
                  data-testid="drawer-header-reconciliation-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
                >
                  Linked to CRM Customer
                </span>
              )}
            </div>

            <h2 className="text-lg font-extrabold text-slate-900 truncate">
              {appointment.bookingName}
            </h2>
            <p className="text-xs text-slate-500 truncate">
              Event: <span className="font-semibold text-slate-700">{appointment.eventName}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status / Error Banner */}
          {statusBanner && (
            <div
              role={statusBanner.type === 'error' ? 'alert' : 'status'}
              data-testid={
                statusBanner.type === 'error'
                  ? 'drawer-link-error-banner'
                  : 'drawer-link-success-banner'
              }
              className={`rounded-xl border px-4 py-3 text-xs flex items-start justify-between gap-3 ${
                statusBanner.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : statusBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="font-semibold leading-relaxed">{statusBanner.message}</div>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-[11px] font-bold opacity-75 hover:opacity-100 shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 1. Booking Schedule & Invitee Details */}
          <section className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Booking &amp; Schedule Details
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                Agent:{' '}
                <span className="text-slate-800 font-bold">
                  {appointment.assignedAgentName}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded-lg border border-slate-200/80 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Appointment Date &amp; Time
                </div>
                <div className="font-bold text-slate-900 mt-0.5">{startFormatted.fullDate}</div>
                <div className="text-slate-600 mt-0.5">
                  {startFormatted.timeStr}
                  {endFormatted.timeStr ? ` – ${endFormatted.timeStr}` : ''} (
                  {startFormatted.tzLabel})
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200/80 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Booking Invitee Contact
                </div>
                <div className="font-bold text-slate-900 mt-0.5">{appointment.bookingName}</div>
                <div className="text-slate-600 truncate mt-0.5">
                  {appointment.inviteeEmail || 'No email recorded'}
                </div>
              </div>
            </div>

            {(appointment.meetingUrl ||
              appointment.userNotes ||
              appointment.cancellationReason) && (
              <div className="bg-white rounded-lg border border-slate-200/80 p-3 space-y-2 text-xs">
                {appointment.meetingUrl && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium">Meeting Location / Link:</span>
                    {appointment.meetingUrl.startsWith('http') ? (
                      <a
                        href={appointment.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-blue-600 hover:underline truncate max-w-xs"
                      >
                        {appointment.meetingUrl}
                      </a>
                    ) : (
                      <span className="font-semibold text-slate-800">
                        {appointment.meetingUrl}
                      </span>
                    )}
                  </div>
                )}

                {appointment.cancellationReason && (
                  <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5 text-[11px]">
                    <span className="font-bold">Cancellation Reason:</span>{' '}
                    {appointment.cancellationReason}
                  </div>
                )}

                {appointment.userNotes && (
                  <div className="pt-1 border-t border-slate-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Invitee Notes / Pre-Meeting Q&amp;A
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap text-[11px] bg-slate-50 p-2.5 rounded border border-slate-200/70">
                      {appointment.userNotes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2. Linked or Proposed Exact-Name Match Customer Section */}
          {appointment.isLinked && appointment.resolvedClientId && (
            <section
              data-testid={
                appointment.isProposedPreview
                  ? 'drawer-proposed-exact-match-card'
                  : 'drawer-linked-customer-card'
              }
              className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  {appointment.isProposedPreview
                    ? 'Proposed Exact-Name Customer Match — Confirmation Required'
                    : 'Linked CRM Customer Profile'}
                </h3>
                <span
                  data-testid="drawer-customer-match-badge"
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    appointment.isProposedPreview
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {appointment.matchMethodBadge}
                </span>
              </div>

              {appointment.isProposedPreview && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1">
                  <div className="font-bold">
                    Exact Normalized Full-Name Match Identified
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Calendly booking name{' '}
                    <span className="font-bold">&ldquo;{appointment.bookingName}&rdquo;</span>{' '}
                    matches existing CRM customer{' '}
                    <span className="font-bold">
                      &ldquo;{appointment.resolvedClientName}&rdquo;
                    </span>
                    . Confirm below to persist this link in{' '}
                    <code className="font-mono text-[10px] bg-blue-100/80 px-1 py-0.5 rounded">
                      calendar_appointments.client_id
                    </code>
                    .
                  </p>
                </div>
              )}

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div
                    className="text-sm font-extrabold text-slate-900"
                    data-testid="drawer-linked-customer-name"
                  >
                    {appointment.resolvedClientName}
                  </div>
                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      CRM Email:{' '}
                      <strong className="text-slate-800">
                        {appointment.resolvedClientEmail || 'Not recorded'}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Phone:{' '}
                      <strong className="text-slate-800">
                        {appointment.resolvedClientPhone || 'Not recorded'}
                      </strong>
                    </span>
                  </div>
                  {appointment.resolvedClientCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {appointment.resolvedClientCategories.map((cat) => (
                        <span
                          key={cat}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${CATEGORY_BADGE_STYLES[cat].className}`}
                        >
                          {CATEGORY_BADGE_STYLES[cat].label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <NextLink
                  href={`/clients/${appointment.resolvedClientId}`}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-blue-700 text-xs font-bold shrink-0 text-center transition-colors"
                >
                  Open Customer Profile →
                </NextLink>
              </div>

              {appointment.familyContextNote && (
                <div className="bg-purple-50/70 border border-purple-200 rounded-lg px-3 py-2 text-[11px] text-purple-900">
                  <span className="font-bold">Household / Family Booking Note:</span>{' '}
                  {appointment.familyContextNote}
                </div>
              )}

              {/* Action Controls for Proposed Exact-Name Match OR Linked Appointment Correction */}
              {appointment.isProposedPreview ? (
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    data-testid="btn-confirm-exact-match"
                    onClick={() =>
                      handleConfirmClient(
                        appointment.resolvedClientId!,
                        appointment.resolvedClientName || 'Exact Name Match'
                      )
                    }
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-2xs"
                  >
                    {isSubmitting
                      ? 'Saving Link...'
                      : `Confirm Exact-Name Match (${appointment.resolvedClientName})`}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    data-testid="btn-toggle-manual-search"
                    onClick={() => setIsEditingLink((prev) => !prev)}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                  >
                    {isEditingLink ? 'Hide Customer Search' : 'Search Different Customer'}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    data-testid="btn-keep-pending-review"
                    onClick={() => handleUnlinkOrKeepPending(true)}
                    className="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold transition-colors"
                  >
                    Hold in Pending Review
                  </button>
                </div>
              ) : (
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500">
                    Need to reassign this appointment to another CRM customer or return it to review?
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      data-testid="btn-correct-linked-customer"
                      onClick={() => setIsEditingLink((prev) => !prev)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                    >
                      {isEditingLink ? 'Cancel Correction' : 'Correct / Change Customer'}
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      data-testid="btn-unlink-appointment"
                      onClick={() => handleUnlinkOrKeepPending(false)}
                      className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold transition-colors"
                    >
                      Unlink &amp; Return to Pending Review
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 3. Pending Review Diagnostic & Classification Section */}
          {appointment.isPendingReview && (
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Manual Review Diagnostic
                  </h3>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {appointment.pendingReviewReasonLabel}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                  Manual Review Required
                </span>
              </div>

              {appointment.pendingReviewReasonDetail && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                  {appointment.pendingReviewReasonDetail}
                </div>
              )}

              {/* 4 Required Review Classification Indicators */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Review Classification Identification
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      'existing_customer_candidate',
                      'potential_new_customer',
                      'possible_duplicate_appointment',
                      'family_member_booking',
                    ] as PendingReviewClassification[]
                  ).map((clsKey) => {
                    const isDetected = appointment.reviewClassifications.includes(clsKey);
                    const meta = CLASSIFICATION_META[clsKey];
                    return (
                      <div
                        key={clsKey}
                        data-testid={`review-classification-${clsKey}`}
                        data-active={isDetected ? 'true' : 'false'}
                        className={`p-3 rounded-lg border transition-all ${
                          isDetected ? meta.activeClass : meta.inactiveClass
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold">{meta.title}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              isDetected
                                ? 'bg-white/90 text-slate-900 border border-current/20'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {isDetected ? 'Identified' : 'No'}
                          </span>
                        </div>
                        <p className="text-[11px] mt-1 leading-snug opacity-90">
                          {meta.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Duplicate Sibling Appointments (if any) */}
              {siblingDuplicates.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-amber-900">
                    Related / Possible Duplicate Bookings for {appointment.bookingName} (
                    {siblingDuplicates.length})
                  </div>
                  <div className="space-y-1.5">
                    {siblingDuplicates.map((dup) => {
                      const dTime = formatEasternDateTime(dup.startsAt);
                      return (
                        <div
                          key={dup.id}
                          className="bg-white rounded border border-amber-200 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{dTime.fullDate}</span> at{' '}
                            <span className="font-semibold text-slate-700">{dTime.timeStr}</span> •{' '}
                            <span className="uppercase text-[10px] font-bold text-slate-600">
                              {dup.status}
                            </span>
                          </div>
                          {onSelectAppointment && (
                            <button
                              type="button"
                              onClick={() => onSelectAppointment(dup.id)}
                              className="text-[11px] font-bold text-blue-600 hover:underline"
                            >
                              Inspect Slot →
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suggested Customer Matches List with Active Confirm & Link Buttons */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Suggested Customer Matches ({appointment.suggestedCandidates.length})
                  </span>
                </div>

                {appointment.suggestedCandidates.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    No existing CRM customer profiles matched automatically by email or full name. Use{' '}
                    <strong className="text-slate-900">Manual Customer Search</strong> below to link an existing customer, or keep this booking in{' '}
                    <strong className="text-slate-900">Pending Review</strong> if it is a new prospect.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {appointment.suggestedCandidates.map((cand) => (
                      <div
                        key={cand.clientId}
                        data-testid={`suggested-candidate-card-${cand.clientId}`}
                        className={`p-3.5 rounded-lg border ${
                          cand.isValidatedPrimary
                            ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-200'
                            : cand.confidence === 'high'
                            ? 'bg-white border-blue-200'
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-extrabold text-slate-900">
                                {cand.fullName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  cand.isValidatedPrimary
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : cand.confidence === 'high'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : cand.confidence === 'medium'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {cand.matchTypeLabel}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600">
                              CRM Email:{' '}
                              <strong className="text-slate-800">{cand.email || '—'}</strong> •
                              Phone: <strong className="text-slate-800">{cand.phone || '—'}</strong>
                            </div>

                            <p className="text-[11px] text-slate-700 mt-1">{cand.explanation}</p>

                            {cand.categories.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {cand.categories.map((cat) => (
                                  <span
                                    key={cat}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${CATEGORY_BADGE_STYLES[cat].className}`}
                                  >
                                    {CATEGORY_BADGE_STYLES[cat].label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              data-testid={`btn-confirm-candidate-${cand.clientId}`}
                              onClick={() => handleConfirmClient(cand.clientId, cand.fullName)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-2xs disabled:opacity-50 ${
                                cand.isValidatedPrimary || cand.confidence === 'high'
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'bg-slate-800 hover:bg-slate-900 text-white'
                              }`}
                            >
                              {isSubmitting ? 'Linking...' : 'Confirm & Link'}
                            </button>

                            <NextLink
                              href={`/clients/${cand.clientId}`}
                              className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-blue-600 transition-colors"
                            >
                              View Profile →
                            </NextLink>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 4. Manual CRM Customer Search & Selection Panel (For Pending Review OR Correcting a Link) */}
          {showManualSearchPanel && (
            <section
              data-testid="drawer-manual-search-section"
              className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    {appointment.isLinked
                      ? 'Correct / Reassign Linked CRM Customer'
                      : 'Search & Link Existing CRM Customer'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Search across {agentScopedClients.length} existing CRM customer records in{' '}
                    {appointment.assignedAgentName}&apos;s portfolio by name, email, or phone.
                  </p>
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  data-testid="drawer-manual-client-search"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  placeholder="Search existing customer by name, email, or phone..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {manualSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setManualSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 hover:text-slate-700"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Search Results List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {manualSearchResults.length === 0 ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    No existing CRM customer matches &ldquo;{manualSearchQuery}&rdquo;.
                  </div>
                ) : (
                  manualSearchResults.map((client) => {
                    const isSelected = selectedManualClientId === client.id;
                    return (
                      <div
                        key={client.id}
                        data-testid={`manual-client-option-${client.id}`}
                        onClick={() =>
                          setSelectedManualClientId((prev) =>
                            prev === client.id ? null : client.id
                          )
                        }
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 ring-1 ring-blue-400/40'
                            : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-900">
                              {client.fullName}
                            </span>
                            {client.categories.map((cat) => (
                              <span
                                key={cat}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${CATEGORY_BADGE_STYLES[cat].className}`}
                              >
                                {CATEGORY_BADGE_STYLES[cat].label}
                              </span>
                            ))}
                          </div>
                          <div className="text-[11px] text-slate-600 truncate">
                            Email: <strong className="text-slate-800">{client.email || '—'}</strong>{' '}
                            • Phone:{' '}
                            <strong className="text-slate-800">{client.phone || '—'}</strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {isSelected ? 'Selected ✓' : 'Select'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Action Bar for Selected Manual Customer or Keep Pending */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                {selectedManualClient ? (
                  <div className="text-xs text-slate-700">
                    Selected:{' '}
                    <strong className="text-slate-900 font-extrabold">
                      {selectedManualClient.fullName}
                    </strong>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    Select an existing CRM customer above to link this appointment.
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {appointment.isPendingReview && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      data-testid="btn-keep-pending-review"
                      onClick={() => handleUnlinkOrKeepPending(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                    >
                      Keep in Pending Review
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!selectedManualClient || isSubmitting}
                    data-testid="btn-save-manual-link"
                    onClick={() => {
                      if (selectedManualClient) {
                        handleConfirmClient(
                          selectedManualClient.id,
                          selectedManualClient.fullName
                        );
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold transition-colors shadow-2xs"
                  >
                    {isSubmitting
                      ? 'Saving Link...'
                      : appointment.isLinked
                      ? 'Save Corrected Customer Link'
                      : 'Link Selected Customer'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Bottom Drawer Bar */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <NextLink
            href={calendarHref}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors"
          >
            Open in Calendar
          </NextLink>

          <div className="flex items-center gap-2">
            {appointment.resolvedClientId && (
              <NextLink
                href={`/clients/${appointment.resolvedClientId}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition-colors"
              >
                Customer Profile →
              </NextLink>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
