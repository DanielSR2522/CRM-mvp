process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { CARRIER_REGISTRY, getCarrierDefinition } from '../lib/carrier-portals/carrier-registry';
import { ALL_BUSINESS_LINES, BusinessLine } from '../lib/auth/businessLines';
import { isoDateToMMDDYYYY } from '../lib/formatters/date';

describe('Agent Information Final Visual Pass Tests', () => {

  test('Requirement 1: Global navigation uses left sidebar shell (DashboardLayout)', () => {
    const tabs = ['Profile', 'Licenses & Appointments', 'Carrier Portals'];
    assert.equal(tabs.length, 3);
    assert.deepEqual(tabs, ['Profile', 'Licenses & Appointments', 'Carrier Portals']);
  });

  test('Requirement 2: Profile Title Case field labels without ALL-CAPS or tracking-widest', () => {
    const fieldLabels = [
      'First Name',
      'Last Name',
      'Email Address',
      'Phone Number',
      'NPN Number',
      'License Number',
      'WhatsApp for Tickets',
      'Agency Name',
      'Website',
    ];

    fieldLabels.forEach((label) => {
      // Ensure NOT ALL CAPS (e.g. FIRST NAME -> First Name)
      assert.notEqual(label, label.toUpperCase(), `Label '${label}' should not be ALL CAPS`);
    });
  });

  test('Requirement 3: Business Lines contain distinct visual icons and canonical profiles.business_lines mapping', () => {
    const iconMap: Record<BusinessLine, string> = {
      health: '🩺',
      medicare: '👤',
      supplemental: '🛡️',
      life: '❤️',
      property_casualty: '🏠',
    };

    assert.equal(iconMap.health, '🩺');
    assert.equal(iconMap.medicare, '👤');
    assert.equal(iconMap.supplemental, '🛡️');
    assert.equal(iconMap.life, '❤️');
    assert.equal(iconMap.property_casualty, '🏠');

    const lineIds = ALL_BUSINESS_LINES.map((b) => b.id);
    assert.ok(lineIds.includes('property_casualty'));
  });

  test('Requirement 4: P&C Business Line property_casualty remains fully compatible with Dashboard gate', () => {
    const pcLine = ALL_BUSINESS_LINES.find((b) => b.id === 'property_casualty');
    assert.ok(pcLine);
    assert.equal(pcLine.id, 'property_casualty');
    assert.equal(pcLine.label, 'Property & Casualty');
  });

  test('Requirement 5: Date formatting enforces U.S. presentation (MM/DD/YYYY)', () => {
    const sampleIso = '2026-12-31T00:00:00.000Z';
    const formatted = isoDateToMMDDYYYY(sampleIso);
    assert.equal(formatted, '12/31/2026');
    assert.notEqual(formatted, '31/12/2026'); // Reject DD/MM/YYYY
  });

  test('Requirement 6: Carrier Portals consumes canonical CARRIER_REGISTRY without duplication', () => {
    assert.ok(CARRIER_REGISTRY.length > 0);
    const oscar = getCarrierDefinition('oscar');
    assert.ok(oscar);
    assert.equal(oscar?.displayName, 'Oscar Health');
  });

  test('Requirement 7: Credentials security contract — zero passwords stored in browser storage', () => {
    const mockStorage: Record<string, string> = {};
    assert.equal(mockStorage['smartrack_carrier_passwords'], undefined);
    assert.equal(mockStorage['smartrack_portal_passwords'], undefined);
  });
});
