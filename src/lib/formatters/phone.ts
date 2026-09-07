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
 * Formats a phone string into standard US format (###-###-####) or preserves international E.164 format.
 */
export function formatUSPhone(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();

  // If already starts with '+' (e.g. +573022213630, +13055551234), preserve it
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return `+${digits}`;
  }

  const digits = digitsOnly(trimmed);
  // If > 11 digits without '+', treat as international E.164 number
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
  return formatUSPhone(value);
}

/**
 * Validates if string represents a valid US (10 digits) or international E.164 phone number.
 */
export function isValidUSPhoneLength(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }
  return extractUSPhoneDigits(value).length === 10;
}
