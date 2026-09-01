export type CarrierSessionStatus =
  | 'not_connected'
  | 'setup_required'
  | 'connecting'
  | 'connected'
  | 'reauthentication_required'
  | 'error'
  | 'disabled';

export type SessionValidationStatus = CarrierSessionStatus;

export interface CarrierSyncPayload {
  csvContent: string;
  sourceFilename?: string;
  metadata?: Record<string, any>;
}

export type SyncBookPayload = CarrierSyncPayload;

export interface CarrierAutomationAdapter {
  /** Canonical carrier identifier (e.g. 'oscar', 'ambetter', 'molina', etc.) */
  readonly carrier: string;

  /** Whether adapter supports Playwright storageState session reuse */
  readonly supportsSessionReuse: boolean;

  /** Validate if persisted agent session remains active & authenticated */
  validateSession(agentId: string): Promise<CarrierSessionStatus>;

  /** Optional headed interactive login runner */
  startInteractiveLogin(agentId: string): Promise<CarrierSessionStatus>;

  /** Download Individual Book CSV using restored session context */
  syncBook(agentId: string): Promise<CarrierSyncPayload>;
}
