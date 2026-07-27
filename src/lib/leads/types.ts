export type LeadStatus = 'new' | 'contacted' | 'in_progress' | 'qualified' | 'converted' | 'lost';
export type LeadPriority = 'low' | 'medium' | 'high';

export interface Lead {
  id: string;
  agent_id: string;
  converted_client_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  product_interest: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  next_follow_up_at: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  converted_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface LeadMetrics {
  totalLeads: number;
  newLeads: number;
  inProgressLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  followUpsDue: number;
}

export type FollowUpFilterOption = 'all' | 'due' | 'today' | 'upcoming' | 'none';

export interface LeadFiltersState {
  searchQuery: string;
  status: LeadStatus | 'all';
  priority: LeadPriority | 'all';
  productInterest: string;
  followUp: FollowUpFilterOption;
  createdFromUs: string;
  createdToUs: string;
}

export interface DuplicateClientCandidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  matchedBy: 'email' | 'phone' | 'both';
}

export interface LeadNoteAttachment {
  id: string;
  lead_id: string;
  note_id: string;
  agent_id: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  agent_id: string;
  parent_note_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  attachments?: LeadNoteAttachment[];
  replies?: LeadNote[];
}

export interface LeadDocument {
  id: string;
  lead_id: string;
  agent_id: string;
  display_name: string;
  document_type: string | null;
  description: string | null;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export type TimelineEventType =
  | 'lead_created'
  | 'lead_updated'
  | 'status_changed'
  | 'priority_changed'
  | 'follow_up_changed'
  | 'note_added'
  | 'note_updated'
  | 'note_deleted'
  | 'note_attachment_added'
  | 'note_attachment_deleted'
  | 'document_uploaded'
  | 'document_updated'
  | 'document_deleted'
  | 'lead_converted';

export interface LeadTimelineEvent {
  id: string;
  lead_id: string;
  agent_id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface PastedImagePreview {
  id: string;
  file: File;
  previewUrl: string;
  filename: string;
}
