import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhoneE164,
  formatUSPhone,
  isValidUSPhoneLength,
} from '../phone.js';

describe('Canonical Phone Normalization (normalizePhoneE164)', () => {
  it('normalizes 10-digit US numbers to +1 E.164', () => {
    assert.equal(normalizePhoneE164('3055551234'), '+13055551234');
    assert.equal(normalizePhoneE164('(305) 555-1234'), '+13055551234');
    assert.equal(normalizePhoneE164('305-555-1234'), '+13055551234');
  });

  it('normalizes 11-digit US numbers starting with 1 to +1 E.164', () => {
    assert.equal(normalizePhoneE164('13055551234'), '+13055551234');
    assert.equal(normalizePhoneE164('1-305-555-1234'), '+13055551234');
    assert.equal(normalizePhoneE164('+1 (305) 555-1234'), '+13055551234');
    assert.equal(normalizePhoneE164('+13055551234'), '+13055551234');
  });

  it('preserves explicit international numbers starting with +', () => {
    assert.equal(normalizePhoneE164('+573001234567'), '+573001234567');
    assert.equal(normalizePhoneE164('+52 1 55 1234 5678'), '+5215512345678');
  });

  it('rejects ambiguous numbers without leading + that are not valid US length', () => {
    // 12-digit Colombian number without '+' must be rejected (returns null)
    assert.equal(normalizePhoneE164('573001234567'), null);
    // 7-digit local US number must be rejected
    assert.equal(normalizePhoneE164('5551234'), null);
    // 5-digit short code
    assert.equal(normalizePhoneE164('12345'), null);
  });

  it('handles null, undefined, empty strings, and non-digit noise', () => {
    assert.equal(normalizePhoneE164(null), null);
    assert.equal(normalizePhoneE164(undefined), null);
    assert.equal(normalizePhoneE164(''), null);
    assert.equal(normalizePhoneE164('   '), null);
    assert.equal(normalizePhoneE164('not-a-phone'), null);
  });
});

describe('formatUSPhone', () => {
  it('formats US numbers to ###-###-#### for display', () => {
    assert.equal(formatUSPhone('3055551234'), '305-555-1234');
    assert.equal(formatUSPhone('+13055551234'), '305-555-1234');
  });

  it('preserves non-US international E.164 numbers', () => {
    assert.equal(formatUSPhone('+573022213630'), '+573022213630');
    assert.equal(formatUSPhone('+5215512345678'), '+5215512345678');
  });
});

describe('isValidUSPhoneLength', () => {
  it('validates 10-digit US and explicit + international numbers', () => {
    assert.equal(isValidUSPhoneLength('3055551234'), true);
    assert.equal(isValidUSPhoneLength('+573001234567'), true);
    assert.equal(isValidUSPhoneLength('5551234'), false);
    assert.equal(isValidUSPhoneLength('573001234567'), false);
  });
});
