import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatMaskedCardNumber,
  formatMaskedAccountNumber,
  formatMaskedRoutingNumber,
} from '../formatters';

describe('Payment Mask Formatters', () => {
  it('formats card number with standard 4-digit last4', () => {
    const result = formatMaskedCardNumber('7638');
    assert.strictEqual(result, '•••• •••• •••• 7638');
  });

  it('handles empty or missing card last4 gracefully without exposing unmasked digits', () => {
    const resultEmpty = formatMaskedCardNumber('');
    assert.strictEqual(resultEmpty, '•••• •••• •••• ••••');
    
    const resultNull = formatMaskedCardNumber(undefined as any);
    assert.strictEqual(resultNull, '•••• •••• •••• ••••');
  });

  it('ensures output contains no UTF-8 mojibake characters', () => {
    const cardMask = formatMaskedCardNumber('7638');
    const accountMask = formatMaskedAccountNumber('1234');
    const routingMask = formatMaskedRoutingNumber();

    // Check for common UTF-8 mojibake artifact characters (â, €, ¢)
    const mojibakeRegex = /[â€¢]/;
    assert.strictEqual(mojibakeRegex.test(cardMask), false, 'Card mask should not contain mojibake characters');
    assert.strictEqual(mojibakeRegex.test(accountMask), false, 'Account mask should not contain mojibake characters');
    assert.strictEqual(mojibakeRegex.test(routingMask), false, 'Routing mask should not contain mojibake characters');
  });

  it('ensures card mask never exposes full 16-digit PAN', () => {
    const fullPan = '4532012345677638';
    const last4Only = fullPan.slice(-4);
    const masked = formatMaskedCardNumber(last4Only);

    assert.strictEqual(masked.includes(fullPan), false, 'Masked output must not include full PAN');
    assert.strictEqual(masked, '•••• •••• •••• 7638');
  });

  it('formats account number correctly', () => {
    assert.strictEqual(formatMaskedAccountNumber('5678'), '••••5678');
  });

  it('formats routing number correctly', () => {
    assert.strictEqual(formatMaskedRoutingNumber(), '•••••••••');
  });
});
