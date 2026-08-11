export const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
export const LAURA_UUID = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

export interface AssignedAgentDisplayParams {
  clientAgentId?: string | null;
  currentUserId?: string | null;
  isEligiblePcClient?: boolean;
  fallbackName?: string | null;
}

/**
 * Computes assigned agent display name following Dalma Services business rules.
 * "Dalma Services" displays ONLY when:
 * 1. isEligiblePcClient === true (the client has actual Property & Casualty business)
 * 2. client owner is Amanda or Laura
 * 3. current user is Amanda or Laura
 *
 * Otherwise returns the real assigned agent display name.
 * Database clients.agent_id is NEVER modified.
 */
export function getAssignedAgentDisplay({
  clientAgentId,
  currentUserId,
  isEligiblePcClient = false,
  fallbackName = null
}: AssignedAgentDisplayParams): string {
  if (!clientAgentId) return fallbackName || 'Unassigned';

  const isAmandaOrLauraClient = clientAgentId === AMANDA_UUID || clientAgentId === LAURA_UUID;
  const isCurrentAmandaOrLaura = currentUserId === AMANDA_UUID || currentUserId === LAURA_UUID;

  if (isEligiblePcClient && isAmandaOrLauraClient && isCurrentAmandaOrLaura) {
    return 'Dalma Services';
  }

  return fallbackName || 'Agent';
}
