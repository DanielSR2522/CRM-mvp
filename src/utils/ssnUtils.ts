/**
 * Utility functions for SSN formatting, normalization, and validation.
 */

/**
 * Formats a raw text or digit string into SSN format: ###-##-####.
 * Accepts digits only, max 9 digits. Automatically inserts hyphens.
 */
export const formatSsnInput = (val: string | null | undefined): string => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '').slice(0, 9);
  if (clean.length > 5) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
  } else if (clean.length > 3) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return clean;
};

/**
 * Strips non-digits from an SSN input string to return normalized 9-digit string.
 */
export const normalizeSsn = (val: string | null | undefined): string => {
  if (!val) return '';
  return val.replace(/\D/g, '').slice(0, 9);
};

/**
 * Validates whether an SSN string contains exactly 9 digits when provided.
 * Returns true if empty (if optional) or if normalized length is exactly 9 digits.
 */
export const isValidSsn = (val: string | null | undefined, allowEmpty = true): boolean => {
  if (!val || !val.trim()) return allowEmpty;
  const clean = normalizeSsn(val);
  return clean.length === 9;
};

/**
 * Formats a masked SSN string e.g. •••-••-6789.
 */
export const maskSsn = (value: string | null | undefined, last4?: string): string => {
  if (last4 && last4.length === 4) {
    return `•••-••-${last4}`;
  }
  if (!value) return '—';
  const clean = value.replace(/\D/g, '');
  if (clean.length === 9) {
    return `•••-••-${clean.slice(5)}`;
  }
  return '••••••••';
};
