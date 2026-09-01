export type SessionValidationStatus = 'connected' | 'reauthentication_required' | 'error';

export interface AutomationSessionState {
  agentId: string;
  carrier: 'oscar';
  sessionPath: string;
  status: SessionValidationStatus;
  lastValidatedAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface AutomatedSyncResult {
  success: boolean;
  sessionStatus: SessionValidationStatus;
  syncRunId?: string | null;
  recordsFound?: number;
  matchedCount?: number;
  reviewCount?: number;
  unmatchedCount?: number;
  changedCount?: number;
  error?: string | null;
}
