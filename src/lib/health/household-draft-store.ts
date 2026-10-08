export interface InMemoryHouseholdMember {
  member_number: number;
  coverage: boolean;
  full_name?: string;
  date_of_birth?: string | null;
  relationship_to_applicant?: string;
  gender?: string;
  us_citizen?: boolean;
  uses_tobacco?: boolean;
  annual_income?: number;
  immigration_status?: string;
  ssn?: string | null;
  ssn_encrypted?: string | null;
}

export interface InMemoryHouseholdDraft {
  taxMemberCount: number;
  members: InMemoryHouseholdMember[];
}

const memoryDraftStore = new Map<string, InMemoryHouseholdDraft>();

export function setInMemoryHouseholdDraft(clientId: string, draft: InMemoryHouseholdDraft) {
  if (!clientId) return;
  memoryDraftStore.set(clientId, draft);
}

export function getInMemoryHouseholdDraft(clientId: string): InMemoryHouseholdDraft | null {
  if (!clientId) return null;
  return memoryDraftStore.get(clientId) || null;
}

export function clearInMemoryHouseholdDraft(clientId: string) {
  if (!clientId) return;
  memoryDraftStore.delete(clientId);
}
