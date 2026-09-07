/**
 * Centralized Phone Formatting Utilities for SmarTrack CRM
 * Formats US phone numbers (###-###-####) while preserving international E.164 numbers.
 */

/**
 * Extracts digits only from string
 */
export function digitsOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Extracts US 10-digit phone number, stripping optional leading '1' if 11 digits starting with '1'.
 */
export function extractUSPhoneDigits(value: string | null | undefined): string {
  if (!value) return '';
  let digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Canonical E.164 phone normalizer.
 * Converts valid US or international phone inputs into standard E.164 format (+1XXXXXXXXXX or +countrycode...).
 *
 * Behavior:
 * 1. Explicit '+' international input: preserves country code if digits length is between 7 and 15 inclusive.
 * 2. Non-'+' input:
 *    - 10 digits -> defaults to US +1 (e.g. "3055551234" -> "+13055551234")
 *    - 11 digits starting with '1' -> US +1 (e.g. "13055551234" -> "+13055551234")
 *    - Any other length / format (e.g. 7-digit local US, or 11/12 digits without '+' not starting with 1) -> rejected (returns null).
 * 3. Null, empty, or whitespace-only input -> returns null.
 */
export function normalizePhoneE164(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Formats a phone string into standard US format (###-###-####) or preserves international E.164 format.
 */
export function formatUSPhone(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      const usDigits = digits.slice(1);
      return `${usDigits.slice(0, 3)}-${usDigits.slice(3, 6)}-${usDigits.slice(6, 10)}`;
    }
    return `+${digits}`;
  }

  const digits = digitsOnly(trimmed);
  if (digits.length > 11) {
    return `+${digits}`;
  }

  const usDigits = extractUSPhoneDigits(trimmed);
  if (!usDigits) return trimmed;

  if (usDigits.length <= 3) {
    return usDigits;
  }
  if (usDigits.length <= 6) {
    return `${usDigits.slice(0, 3)}-${usDigits.slice(3)}`;
  }
  return `${usDigits.slice(0, 3)}-${usDigits.slice(3, 6)}-${usDigits.slice(6, 10)}`;
}

/**
 * Normalizes phone number to standard format for storage or display.
 */
export function normalizeUSPhone(value: string | null | undefined): string {
  if (!value) return '';
  return normalizePhoneE164(value) ?? '';
}

/**
 * Validates if string represents a valid US (10 digits) or international E.164 phone number.
 */
export function isValidUSPhoneLength(value: string | null | undefined): boolean {
  return normalizePhoneE164(value) !== null;
}
