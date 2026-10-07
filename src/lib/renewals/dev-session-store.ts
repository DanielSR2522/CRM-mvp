export interface DevRenewalSession {
  client_id: string; // REAL public.clients.id
  agent_profile_id?: string; // Loni's profile ID: 'd1c696ef-c77d-4b2b-a3f5-83acd965c363'
  client_name: string;
  agent_name: string;
  phone: string;
  language: string;
  status: string;
  answers: Record<string, any>;
  confirmed_fields: Record<string, boolean>;
  completed_topics: string[];
  missing_topics: string[];
  needs_agent_review: boolean;
  bot_status: 'not_sent' | 'sent' | 'in_conversation' | 'completed';
  readiness: 'missing_info' | 'review_needed' | 'ready';
  started_at: string;
  last_activity_at: string;
  messages: Array<{
    id: string;
    sender: 'bot' | 'client';
    text: string;
    timestamp: string;
  }>;
}

const LONI_PROFILE_ID = 'd1c696ef-c77d-4b2b-a3f5-83acd965c363';

// In-memory local session store for development prototype (zero DB write)
const devSessionMap = new Map<string, DevRenewalSession>();

export function saveDevSession(session: DevRenewalSession): void {
  if (!session.client_id || session.client_id === LONI_PROFILE_ID) {
    throw new Error(`Invalid client_id: ${session.client_id} is an agent profile ID or empty.`);
  }
  devSessionMap.set(session.client_id, session);
}

export function getDevSession(clientId: string): DevRenewalSession | undefined {
  return devSessionMap.get(clientId);
}

export function getAllDevSessions(): DevRenewalSession[] {
  return Array.from(devSessionMap.values());
}
