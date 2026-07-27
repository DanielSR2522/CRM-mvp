export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export interface CalendarAppointment {
  id: string;
  agent_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

export interface PolicyExpirationItem {
  id: string;
  client_id: string;
  policy_number: string | null;
  policy_type: string;
  company_name: string | null;
  writing_company: string | null;
  expiration_date: string;
  client: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface ExtendedCalendarEventProps {
  eventType: 'appointment' | 'policy_expiration';
  appointmentId?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: string;
  endsAt?: string;
  status?: AppointmentStatus;
  policyId?: string;
  policyType?: string;
  policyNumber?: string | null;
  company?: string | null;
  expirationDate?: string;
  clientId?: string | null;
  clientName?: string | null;
}
