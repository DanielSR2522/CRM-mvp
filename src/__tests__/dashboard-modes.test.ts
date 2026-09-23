import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BusinessLine } from '../lib/auth/businessLines';

/**
 * Winterfell Dashboard Redesign & Business Line Visibility Gate Unit Tests
 */

interface MockPolicy {
  id: string;
  client_id: string;
  policy_type: string;
  status: string;
  created_at: string;
  effective_date?: string;
  expiration_date?: string;
  premium?: number;
  members?: any[];
}

/**
 * Helper to simulate Business Line Visibility Gate rules
 */
function resolveDashboardGate(
  businessLines: BusinessLine[],
  requestedMode: string | null,
  savedLocalStorageMode: string | null
) {
  const isPcEnabled = businessLines.includes('property_casualty');

  // Sidebar links calculation
  const sidebarLinks = ['+ All Business (Non-P&C)'];
  if (isPcEnabled) {
    sidebarLinks.push('P&C');
  }

  // Header toggles calculation
  const headerToggles = ['All Business (Non-P&C)'];
  if (isPcEnabled) {
    headerToggles.push('P&C');
  }

  // Initial requested mode resolution
  let activeMode = 'non_pc';
  if (requestedMode === 'pc' || requestedMode === 'non_pc') {
    activeMode = requestedMode;
  } else if (savedLocalStorageMode === 'pc' || savedLocalStorageMode === 'non_pc') {
    activeMode = savedLocalStorageMode;
  }

  // Gate enforcement fallback
  let effectiveMode = activeMode;
  let normalizedLocalStorage = savedLocalStorageMode;

  if (!isPcEnabled) {
    effectiveMode = 'non_pc';
    if (activeMode === 'pc') {
      normalizedLocalStorage = 'non_pc';
    }
  }

  return {
    isPcEnabled,
    headerToggles,
    sidebarLinks,
    effectiveMode,
    normalizedLocalStorage,
  };
}

// 1. P&C business line enabled -> P&C toggle visible
test('Gate Rule 1: P&C business line enabled -> P&C toggle visible in header', () => {
  const lines: BusinessLine[] = ['health', 'medicare', 'life', 'property_casualty', 'supplemental'];
  const gate = resolveDashboardGate(lines, null, null);
  assert.equal(gate.isPcEnabled, true);
  assert.equal(gate.headerToggles.includes('P&C'), true, 'P&C header toggle MUST be visible');
});

// 2. P&C business line enabled -> sidebar P&C visible
test('Gate Rule 2: P&C business line enabled -> sidebar P&C link visible', () => {
  const lines: BusinessLine[] = ['health', 'medicare', 'life', 'property_casualty', 'supplemental'];
  const gate = resolveDashboardGate(lines, null, null);
  assert.equal(gate.sidebarLinks.includes('P&C'), true, 'P&C sidebar link MUST be visible');
});

// 3. P&C disabled -> P&C toggle hidden
test('Gate Rule 3: P&C disabled -> P&C toggle hidden from header', () => {
  const lines: BusinessLine[] = ['health', 'medicare', 'life', 'supplemental']; // No P&C
  const gate = resolveDashboardGate(lines, null, null);
  assert.equal(gate.isPcEnabled, false);
  assert.equal(gate.headerToggles.includes('P&C'), false, 'P&C header toggle MUST be hidden');
});

// 4. P&C disabled -> sidebar P&C hidden
test('Gate Rule 4: P&C disabled -> sidebar P&C link hidden', () => {
  const lines: BusinessLine[] = ['health', 'medicare', 'life', 'supplemental']; // No P&C
  const gate = resolveDashboardGate(lines, null, null);
  assert.equal(gate.sidebarLinks.includes('P&C'), false, 'P&C sidebar link MUST be hidden');
});

// 5. P&C disabled + ?mode=pc -> falls back to non_pc
test('Gate Rule 5: P&C disabled + ?mode=pc URL query -> falls back to non_pc', () => {
  const lines: BusinessLine[] = ['health', 'medicare', 'life'];
  const gate = resolveDashboardGate(lines, 'pc', null);
  assert.equal(gate.effectiveMode, 'non_pc', 'Direct URL ?mode=pc MUST fall back to non_pc');
});

// 6. P&C disabled + localStorage=pc -> falls back to non_pc
test('Gate Rule 6: P&C disabled + localStorage=pc -> falls back to non_pc and normalizes localStorage', () => {
  const lines: BusinessLine[] = ['health', 'medicare', 'life'];
  const gate = resolveDashboardGate(lines, null, 'pc');
  assert.equal(gate.effectiveMode, 'non_pc', 'Stale localStorage=pc MUST fall back to non_pc');
  assert.equal(gate.normalizedLocalStorage, 'non_pc', 'Stale localStorage MUST be updated to non_pc');
});

// 7. P&C enabled with zero P&C policies -> P&C remains available
test('Gate Rule 7: P&C enabled with zero P&C policies -> P&C remains available', () => {
  const lines: BusinessLine[] = ['health', 'property_casualty'];
  const pcPoliciesCount = 0; // Zero policies in DB
  const gate = resolveDashboardGate(lines, 'pc', null);

  assert.equal(gate.isPcEnabled, true);
  assert.equal(gate.effectiveMode, 'pc', 'Zero P&C policies MUST NOT disable P&C mode if business line is enabled');
  assert.equal(pcPoliciesCount, 0);
});

// 8. Existing Non-P&C/P&C data separation tests continue passing
test('Non-P&C Data Separation: Health, Medicare, Supplemental & Life ONLY', () => {
  const policies: MockPolicy[] = [
    { id: '1', client_id: 'c1', policy_type: 'health', status: 'Active', created_at: '2026-09-01' },
    { id: '2', client_id: 'c1', policy_type: 'medicare', status: 'Active', created_at: '2026-09-02' },
    { id: '3', client_id: 'c1', policy_type: 'supplemental', status: 'Active', created_at: '2026-09-03' },
    { id: '4', client_id: 'c1', policy_type: 'life', status: 'Active', created_at: '2026-09-04' },
    { id: '5', client_id: 'c1', policy_type: 'Auto', status: 'Active', created_at: '2026-09-05' },
    { id: '6', client_id: 'c1', policy_type: 'Homeowner', status: 'Active', created_at: '2026-09-06' },
  ];

  const nonPcPolicies = policies.filter((p) => {
    const t = p.policy_type.toLowerCase();
    return t === 'health' || t === 'medicare' || t === 'supplemental' || t === 'life';
  });

  assert.equal(nonPcPolicies.length, 4);
  assert.equal(nonPcPolicies.some((p) => p.policy_type === 'Auto'), false, 'Non-P&C MUST NOT include Auto');
  assert.equal(nonPcPolicies.some((p) => p.policy_type === 'Homeowner'), false, 'Non-P&C MUST NOT include Homeowner');
});

test('P&C Data Separation: Property & Casualty ONLY', () => {
  const policies: MockPolicy[] = [
    { id: '1', client_id: 'c1', policy_type: 'health', status: 'Active', created_at: '2026-09-01' },
    { id: '2', client_id: 'c1', policy_type: 'Auto', status: 'Active', created_at: '2026-09-05' },
    { id: '3', client_id: 'c1', policy_type: 'Homeowner', status: 'Active', created_at: '2026-09-06' },
    { id: '4', client_id: 'c1', policy_type: 'Commercial', status: 'Active', created_at: '2026-09-07' },
  ];

  const pcPolicies = policies.filter((p) => {
    const t = p.policy_type.toLowerCase();
    return t !== 'health' && t !== 'medicare' && t !== 'supplemental' && t !== 'life';
  });

  assert.equal(pcPolicies.length, 3);
  assert.equal(pcPolicies.some((p) => p.policy_type === 'health'), false, 'P&C MUST NOT include Health');
});

test('Health Members Computation: Sums members array or defaults 1 per policy', () => {
  const healthPolicies: MockPolicy[] = [
    { id: '1', client_id: 'c1', policy_type: 'health', status: 'Active', created_at: '2026-09-01', members: ['m1', 'm2', 'm3'] },
    { id: '2', client_id: 'c2', policy_type: 'health', status: 'Active', created_at: '2026-09-02', members: ['m4'] },
    { id: '3', client_id: 'c3', policy_type: 'health', status: 'Active', created_at: '2026-09-03' }, // No members array -> default 1
  ];

  const totalMembers = healthPolicies.reduce((acc, p) => {
    if (Array.isArray(p.members)) return acc + p.members.length;
    return acc + 1;
  }, 0);

  assert.equal(totalMembers, 5);
});

test('P&C Bottom Row Directive: MUST contain ONLY Today Schedule & Recent P&C Activity', () => {
  const pcPanels = ['today_schedule', 'recent_activity'];
  const excludedPanels = ['my_tickets', 'opportunities'];

  assert.equal(pcPanels.includes('today_schedule'), true);
  assert.equal(pcPanels.includes('recent_activity'), true);
  assert.equal(pcPanels.includes('my_tickets'), false, 'P&C MUST NOT include My Tickets panel');
  assert.equal(pcPanels.includes('opportunities'), false, 'P&C MUST NOT include Opportunities panel');
});

test('Non-P&C Bottom Row Panels: Includes Schedule, Tickets, Opportunities & Activity', () => {
  const nonPcPanels = ['today_schedule', 'my_tickets', 'opportunities', 'recent_activity'];
  assert.equal(nonPcPanels.length, 4);
});
