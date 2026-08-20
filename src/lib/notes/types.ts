export type NoteCategory = 'health' | 'life' | 'property_casualty' | 'medicare' | 'supplemental';

export interface NoteAttachment {
  id: string;
  note_id: string;
  client_id: string;
  uploaded_by: string | null;
  display_name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  signedUrl?: string;
}

export interface AuthorProfile {
  id?: string;
  name?: string | null;
  email?: string | null;
}

export interface AssociatedPolicy {
  id: string;
  isHealth?: boolean;
  policy_number?: string | null;
  policy_type?: string | null;
  writing_company?: string | null;
  company_name?: string | null;
}

export interface UnifiedNote {
  id: string;
  client_id: string;
  category: NoteCategory;
  policy_id: string | null;
  health_policy_id?: string | null;
  title?: string | null;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: AuthorProfile | null;
  policies?: AssociatedPolicy | null;
  attachments?: NoteAttachment[];
}

export interface PendingAttachment {
  file: File;
  previewUrl: string;
  displayName: string;
}

export interface CreateNotePayload {
  clientId: string;
  category: NoteCategory;
  policyId?: string | null;
  healthPolicyId?: string | null;
  title?: string | null;
  content: string;
  createdBy?: string | null;
}
