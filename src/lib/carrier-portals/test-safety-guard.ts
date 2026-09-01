import { NormalizedCarrierRecord } from './types';

/**
 * Hardened Test Safety Guard & Synthetic Data Protection for Carrier Portals.
 * Enforces strict non-destructive test isolation and prevents synthetic fixtures from entering real agent connections.
 */

// List of known test-only agent IDs
const KNOWN_TEST_AGENT_IDS = new Set([
  '00000000-0000-0000-0000-000000000001',
  '55310b5f-3f17-4816-a9ab-e27c499f9a85', // isolated test agent
]);

/**
 * Throws an explicit error if a test cleanup/mutation operation attempts to run against a non-test agent ID.
 */
export function assertTestIsolation(agentId: string, operationName = 'test mutation'): void {
  if (!agentId) {
    throw new Error(`[Test Safety Guard] ${operationName} blocked: agentId is missing.`);
  }

  const isTestAgent = KNOWN_TEST_AGENT_IDS.has(agentId) || agentId.startsWith('00000000-') || agentId.includes('test');
  if (!isTestAgent) {
    throw new Error(
      `[Test Safety Guard] CRITICAL VIOLATION: Attempted to run '${operationName}' against non-test agent ID '${agentId}'. Operation blocked to protect real developer data!`
    );
  }
}

/**
 * Throws an error if synthetic fixture records (e.g. "Oscar Member 1", "OSC-1001", "Isolated Test")
 * are passed to a real agent connection.
 */
export function assertNoSyntheticData(carrier: string, agentId: string, records: NormalizedCarrierRecord[]): void {
  const isTestAgent = KNOWN_TEST_AGENT_IDS.has(agentId) || agentId.startsWith('00000000-') || agentId.includes('test');
  if (isTestAgent) return; // Allow synthetic fixtures ONLY on dedicated test agents

  for (const rec of records) {
    const name = (rec.member_name || '').toLowerCase();
    const memId = (rec.external_member_id || '').toUpperCase();

    const isSynthetic =
      name.includes('oscar member') ||
      name.includes('ambetter member') ||
      name.includes('isolated test') ||
      name.includes('scheduled member') ||
      name.includes('test member') ||
      memId.startsWith('OSC-10') ||
      memId.startsWith('OSC-80') ||
      memId.startsWith('OSC-99') ||
      memId.startsWith('OSC-90') ||
      memId.startsWith('AMB-99');

    if (isSynthetic) {
      throw new Error(
        `[Synthetic Data Guard] Blocked synthetic record '${rec.member_name}' (${rec.external_member_id}) from entering real agent connection '${agentId}' for carrier '${carrier}'.`
      );
    }
  }
}
