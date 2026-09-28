const BULLET = '\u2022';

/**
 * Formats a payment card number as a 16-character masked string:
 * `•••• •••• •••• 7638`
 * Exposes ONLY the last 4 digits.
 */
export function formatMaskedCardNumber(last4?: string | null): string {
  const cleanLast4 = (last4 || '').trim().slice(-4);
  if (!cleanLast4) {
    return `${BULLET.repeat(4)} ${BULLET.repeat(4)} ${BULLET.repeat(4)} ${BULLET.repeat(4)}`;
  }
  return `${BULLET.repeat(4)} ${BULLET.repeat(4)} ${BULLET.repeat(4)} ${cleanLast4}`;
}

/**
 * Formats a bank account number masked display:
 * `••••7638`
 */
export function formatMaskedAccountNumber(last4?: string | null): string {
  const cleanLast4 = (last4 || '').trim().slice(-4);
  if (!cleanLast4) {
    return `${BULLET.repeat(8)}`;
  }
  return `${BULLET.repeat(4)}${cleanLast4}`;
}

/**
 * Formats a 9-digit routing number masked display:
 * `•••••••••`
 */
export function formatMaskedRoutingNumber(): string {
  return BULLET.repeat(9);
}
