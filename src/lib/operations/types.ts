import type { AppointmentStatus } from '@/lib/calendar/types';

export type InsuranceCategory = 'health' | 'life' | 'medicare' | 'supplemental' | 'pc';

export type InsuranceCategoryFilterMode =
  | 'ALL'
  | 'health'
  | 'life'
  | 'medicare'
  | 'supplemental'
  | 'pc'
  | 'health_only'
  | 'life_only'
  | 'health_and_life';

export type OperationsAppointmentStatus =
  | 'upcoming'
  | 'completed'
  | 'past'
  | 'cancelled'
  | 'none';

export type OperationsAppointmentFilter =
  | 'ALL'
  | 'upcoming'
  | 'scheduled'
  | 'none'
  | 'cancelled'
  | 'completed'
  | 'past';

export type OperationsContactStatus =
  | 'not_recorded'
  | 'not_contacted'
  | 'contacted'
  | 'no_answer'
  | 'follow_up_required'
  | 'appointment_requested'
  | 'not_interested';

export type OperationsNextAction =
  | 'not_recorded'
  | 'call_customer'
  | 'call_back'
  | 'schedule_appointment'
  | 'send_booklet'
  | 'send_qualification_bot'
  | 'review_customer_info'
  | 'review_selected_plan'
  | 'ready_for_enrollment';

export type OperationsPrimaryView =
  | 'all_clients'
  | 'calls'
  | 'appointments'
  | 'preparation'
  | 'renewals';

export type OperationsSortField =
  | 'full_name'
  | 'assigned_agent'
  | 'appointment_status'
  | 'next_appointment'
  | 'categories_count';

export type OperationsSortDirection = 'asc' | 'desc';

export type AppointmentMatchMethod =
  | 'client_id'
  | 'client_identifier'
  | 'unique_email'
  | 'exact_full_name'
  | 'pending_review';

export type PendingReviewReasonCode =
  | 'shared_email_exact_name_validated'
  | 'shared_email_ambiguous'
  | 'partial_name_candidate'
  | 'family_member_candidate'
  | 'duplicate_booking'
  | 'single_first_name_only'
  | 'potential_new_customer';

export type PendingReviewClassification =
  | 'existing_customer_candidate'
  | 'potential_new_customer'
  | 'possible_duplicate_appointment'
  | 'family_member_booking';

export type AppointmentsSubTab =
  | 'all'
  | 'upcoming'
  | 'completed'
  | 'cancelled'
  | 'pending_review';

export type AppointmentsDateFilter =
  | 'ALL'
  | 'today'
  | 'next_7_days'
  | 'oct_2026'
  | 'nov_2026'
  | 'custom';

export type AppointmentsStatusFilter =
  | 'ALL'
  | 'scheduled'
  | 'upcoming'
  | 'need_preparation'
  | 'completed'
  | 'cancelled'
  | 'pending_review';

export type AppointmentsSourceFilter = 'ALL' | 'Calendly' | 'CRM';

export type AppointmentsSortField =
  | 'starts_at'
  | 'booking_name'
  | 'customer_name'
  | 'status'
  | 'match_status'
  | 'assigned_agent';

export interface SuggestedCustomerCandidate {
  clientId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  categories: InsuranceCategory[];
  confidence: 'high' | 'medium' | 'reference';
  matchTypeLabel: string;
  explanation: string;
  isValidatedPrimary?: boolean;
}

export interface OperationsAppointmentRecord {
  id: string;
  agentId: string;
  assignedAgentName: string;
  persistedClientId: string | null;
  resolvedClientId: string | null;
  resolvedClientName: string | null;
  resolvedClientEmail: string | null;
  resolvedClientPhone: string | null;
  resolvedClientCategories: InsuranceCategory[];
  isProposedPreview: boolean;
  isLinked: boolean;
  isPendingReview: boolean;
  matchMethod: AppointmentMatchMethod;
  matchMethodBadge: string;
  rawTitle: string;
  displayTitle: string;
  eventName: string;
  bookingName: string;
  normalizedBookingName: string;
  inviteeEmail: string | null;
  normalizedInviteeEmail: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  temporalState: 'upcoming' | 'past' | 'cancelled' | 'completed';
  isTodayInTz: boolean;
  needsPreparation: boolean;
  preparationReason: string | null;
  source: 'Calendly' | 'CRM';
  location: string | null;
  meetingUrl: string | null;
  cancellationReason: string | null;
  userNotes: string;
  pendingReviewReasonCode: PendingReviewReasonCode | null;
  pendingReviewReasonLabel: string | null;
  pendingReviewReasonDetail: string | null;
  reviewClassifications: PendingReviewClassification[];
  suggestedCandidates: SuggestedCustomerCandidate[];
  duplicateAppointmentIds: string[];
  familyContextNote: string | null;
}

export interface OperationsPolicyFlags {
  hasHealth: boolean;
  hasLife: boolean;
  hasMedicare: boolean;
  hasSupplemental: boolean;
  hasPC: boolean;
}

export interface OperationsPolicyCounts {
  health: number;
  life: number;
  medicare: number;
  supplemental: number;
  pc: number;
  total: number;
}

export interface OperationsRenewalMetadata {
  hasHealthRenewal: boolean;
  healthCarrier?: string | null;
  healthPlanName?: string | null;
  healthRenovationStatus?: string | null;
  healthActionPending?: string | null;
  healthActive?: boolean | null;
  pcNearestExpiration?: string | null;
}

export interface OperationsAppointmentItem {
  id: string;
  agentId: string;
  clientId: string | null;
  rawTitle: string;
  displayTitle: string;
  eventName: string;
  bookedBy: string | null;
  inviteeEmail: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  temporalState: 'upcoming' | 'past' | 'cancelled' | 'completed';
  source: 'Calendly' | 'CRM';
  location: string | null;
  meetingUrl: string | null;
  cancellationReason: string | null;
  userNotes: string;
  matchMethod: 'client_id' | 'unique_email' | 'exact_full_name';
  isProposedPreview?: boolean;
}

export interface UnmatchedCalendlyBookingItem {
  id: string;
  agentId: string;
  displayTitle: string;
  bookedBy: string;
  inviteeEmail: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: 'no_email_match' | 'ambiguous_email';
  ambiguousClients: Array<{ id: string; full_name: string }>;
}

export interface OperationsClientRecord {
  id: string;
  agentId: string | null;
  assignedAgentName: string;
  fullName: string;
  clientType: string | null;
  agencyName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  policyFlags: OperationsPolicyFlags;
  policyCounts: OperationsPolicyCounts;
  categoriesList: InsuranceCategory[];
  renewalMetadata: OperationsRenewalMetadata;
  appointmentStatus: OperationsAppointmentStatus;
  nextAppointment: OperationsAppointmentItem | null;
  upcomingAppointments: OperationsAppointmentItem[];
  pastAppointments: OperationsAppointmentItem[];
  completedAppointments: OperationsAppointmentItem[];
  cancelledAppointments: OperationsAppointmentItem[];
  allAppointments: OperationsAppointmentItem[];
  contactStatus: OperationsContactStatus;
  nextAction: OperationsNextAction;
  verifiedPersistedNote: string | null;
}
