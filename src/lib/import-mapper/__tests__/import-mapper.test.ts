import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { suggestMapping, DESTINATION_FIELDS } from '../fields';
import {
  normalizeDate,
  normalizeEmail,
  normalizeGender,
  normalizeMoney,
  normalizePhone,
  normalizeTypePlan,
  cellToString,
} from '../normalizers';
import { normalizeMappedRow } from '../mapper';
import { ColumnMapping } from '../types';

describe('Universal Import Mapper — Field Catalog & Auto-Mapping', () => {
  it('auto-suggests correct destination fields for all 10 sample source columns', () => {
    const sampleColumns = [
      'Street Address',
      'County',
      'Primary Phone',
      'Primary Email',
      'Type Plan',
      'Company 2026',
      'effective_date',
      'Application Number 2026',
      'Plan ID',
      'No. Membership',
    ];

    const mapping = suggestMapping(sampleColumns);

    assert.equal(mapping['Street Address'], 'client.address');
    assert.equal(mapping['County'], 'client.county');
    assert.equal(mapping['Primary Phone'], 'client.phone');
    assert.equal(mapping['Primary Email'], 'client.email');
    assert.equal(mapping['Type Plan'], 'health_policy.type_plan');
    assert.equal(mapping['Company 2026'], 'health_policy.carrier');
    assert.equal(mapping['effective_date'], 'health_policy.effective_date');
    assert.equal(mapping['Application Number 2026'], 'health_policy.marketplace_application_id');
    assert.equal(mapping['Plan ID'], 'health_policy.plan_id');
    assert.equal(mapping['No. Membership'], 'health_policy.member_id');
  });

  it('preserves existing mappings for legacy CRM headers', () => {
    const legacyColumns = [
      'Full Name',
      'First Name',
      'Last Name',
      'DOB',
      'SSN',
      'Carrier',
      'Policy Number',
      'Premium',
      'Tax Credit',
      'Plan',
    ];

    const mapping = suggestMapping(legacyColumns);

    assert.equal(mapping['Full Name'], 'client.full_name');
    assert.equal(mapping['First Name'], 'client.first_name');
    assert.equal(mapping['Last Name'], 'client.last_name');
    assert.equal(mapping['DOB'], 'client.date_of_birth');
    assert.equal(mapping['SSN'], 'client.ssn');
    assert.equal(mapping['Carrier'], 'health_policy.carrier');
    assert.equal(mapping['Policy Number'], 'health_policy.policy_number');
    assert.equal(mapping['Premium'], 'health_policy.premium');
    assert.equal(mapping['Tax Credit'], 'health_policy.tax_credit');
    assert.equal(mapping['Plan'], 'health_policy.plan');
  });

  it('defaults unknown or ambiguous headers to ignore', () => {
    const unknownColumns = ['Random Extra Column', 'Notes 2024', 'Internal System Reference'];
    const mapping = suggestMapping(unknownColumns);

    assert.equal(mapping['Random Extra Column'], 'ignore');
    assert.equal(mapping['Notes 2024'], 'ignore');
    assert.equal(mapping['Internal System Reference'], 'ignore');
  });

  it('groups destination fields clearly into client, health_policy, and other', () => {
    const clientFields = DESTINATION_FIELDS.filter((f) => f.group === 'client');
    const policyFields = DESTINATION_FIELDS.filter((f) => f.group === 'health_policy');
    const otherFields = DESTINATION_FIELDS.filter((f) => f.group === 'other');

    assert.ok(clientFields.some((f) => f.id === 'client.county'));
    assert.ok(clientFields.some((f) => f.id === 'client.gender'));
    assert.ok(policyFields.some((f) => f.id === 'health_policy.plan_id'));
    assert.ok(policyFields.some((f) => f.id === 'health_policy.type_plan'));
    assert.ok(otherFields.some((f) => f.id === 'ignore'));
  });
});

describe('Universal Import Mapper — Normalization & Identifiers', () => {
  it('preserves leading zeros for identifiers', () => {
    assert.equal(cellToString('0012345'), '0012345');
    assert.equal(cellToString('000987654'), '000987654');
  });

  it('normalizes phone numbers while preserving international country codes', () => {
    assert.equal(normalizePhone('3055551234'), '(305) 555-1234');
    assert.equal(normalizePhone('13055551234'), '(305) 555-1234');
    assert.equal(normalizePhone('+5215512345678'), '+5215512345678');
    assert.equal(normalizePhone('+1 (305) 555-1234'), '+13055551234');
  });

  it('trims and lowercases email addresses', () => {
    assert.equal(normalizeEmail('  JOHN.DOE@Example.COM  '), 'john.doe@example.com');
  });

  it('parses dates safely in US, ISO, and Excel formats', () => {
    assert.equal(normalizeDate('01/15/2026'), '2026-01-15');
    assert.equal(normalizeDate('2026-01-15'), '2026-01-15');
    assert.equal(normalizeDate(46038), '2026-01-16'); // Excel serial date
  });

  it('parses currency and numeric formats safely', () => {
    assert.equal(normalizeMoney('$1,234.50'), 1234.5);
    assert.equal(normalizeMoney(' 450.00 '), 450.0);
    assert.equal(normalizeMoney('0'), 0);
    assert.equal(normalizeMoney(null), null);
  });

  it('normalizes gender values', () => {
    assert.equal(normalizeGender('male'), 'Male');
    assert.equal(normalizeGender('F'), 'Female');
    assert.equal(normalizeGender('Hombre'), 'Male');
    assert.equal(normalizeGender('Mujer'), 'Female');
  });

  it('normalizes metal tier plan types for database constraint compliance', () => {
    assert.equal(normalizeTypePlan('silver plan'), 'Silver');
    assert.equal(normalizeTypePlan('BRONZE'), 'Bronze');
    assert.equal(normalizeTypePlan('Gold Tier'), 'Gold');
    assert.equal(normalizeTypePlan('catastrófico'), 'Catastrophic');
  });
});

describe('Universal Import Mapper — Full Row Mapper', () => {
  it('maps a full row with all sample columns into NormalizedImportRecord', () => {
    const row = {
      'Full Name': 'Amanda Sherpa',
      'Street Address': '123 Main St',
      'County': 'Miami-Dade',
      'Primary Phone': '(305) 555-9999',
      'Primary Email': 'amanda@example.com',
      'Type Plan': 'Silver',
      'Company 2026': 'Ambetter',
      'effective_date': '01/01/2026',
      'Application Number 2026': '00987654',
      'Plan ID': '12345FL0010001',
      'No. Membership': 'MEM-001122',
      'Gender': 'Female',
    };

    const mapping: ColumnMapping = suggestMapping(Object.keys(row));
    const normalized = normalizeMappedRow(row, mapping, 2);

    assert.equal(normalized.client.fullName, 'Amanda Sherpa');
    assert.equal(normalized.client.address, '123 Main St');
    assert.equal(normalized.client.county, 'Miami-Dade');
    assert.equal(normalized.client.phone, '(305) 555-9999');
    assert.equal(normalized.client.email, 'amanda@example.com');
    assert.equal(normalized.client.gender, 'Female');
    assert.equal(normalized.healthPolicy.typePlan, 'Silver');
    assert.equal(normalized.healthPolicy.carrier, 'Ambetter');
    assert.equal(normalized.healthPolicy.effectiveDate, '2026-01-01');
    assert.equal(normalized.healthPolicy.marketplaceApplicationId, '00987654');
    assert.equal(normalized.healthPolicy.planId, '12345FL0010001');
    assert.equal(normalized.healthPolicy.memberId, 'MEM-001122');
    assert.equal(normalized.issues.length, 0);
  });
});
