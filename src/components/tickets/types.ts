export type TicketStatus = "new" | "in_progress" | "waiting_client" | "waiting_carrier" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type PolicySource = "pc" | "health" | "life" | "medicare" | "supplemental";

export interface LanzaUser {
  id: string;
  name: string;
  role?: string;
  profileId?: string;
}

export interface WinterfellClientOption {
  id: string;
  name: string;
  city?: string | null;
  phoneLast4?: string | null;
}

export interface WinterfellPolicyOption {
  id: string;
  source: PolicySource;
  displayLabel: string;
}

export interface CanonicalTicketContext {
  clientId: string | null;
  policyId: string | null;
  policySource: PolicySource | null;
}

export interface TicketItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToId?: string | null;
  assignedToName: string;
  createdById?: string;
  createdByName?: string;
  dueAt?: string | null;
  checklistDone: number;
  checklistTotal: number;
  tags: string[];
  clientId?: string | null;
  clientName?: string | null;
  policyId?: string | null;
  policySource?: PolicySource | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketNote {
  id: string;
  authorName: string;
  authorId?: string;
  content: string;
  body?: string;
  createdAt: string;
}

export interface TicketChecklistItem {
  id: string;
  checklistId?: string;
  title: string;
  content?: string;
  text?: string;
  isDone: boolean;
  doneBy?: string | null;
  doneByName?: string | null;
  doneAt?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  createdAt?: string;
}

export interface TicketChecklistContainer {
  id: string;
  ticketId: string;
  title: string;
  position?: number;
  totalCount: number;
  completedCount: number;
  progressPercent: number;
  createdAt?: string;
  items: TicketChecklistItem[];
}

export interface TicketAttachment {
  id: string;
  name?: string;
  fileName?: string;
  fileUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  uploadedByName?: string;
  uploadedAt?: string;
  createdAt?: string;
}

export interface TicketActivityItem {
  id: string;
  action?: string;
  type?: string;
  description?: string;
  detail?: string;
  actorName?: string;
  createdAt: string;
}

export interface ClientDetails {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface PolicyDetails {
  id: string;
  policyNumber?: string | null;
  carrierName?: string | null;
  source: PolicySource;
}

export interface DetailedTicket extends TicketItem {
  clientDetails?: ClientDetails | null;
  policyDetails?: PolicyDetails | null;
  notes: TicketNote[];
  checklist: TicketChecklistItem[];
  checklists?: TicketChecklistContainer[];
  attachments: TicketAttachment[];
  activity: TicketActivityItem[];
}

export interface TicketsApiResponse {
  success: boolean;
  mapped: boolean;
  appUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  tickets: TicketItem[];
  appUsers: LanzaUser[];
  error?: string;
}

