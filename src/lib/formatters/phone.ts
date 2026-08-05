/**
 * Centralized Phone Formatting Utilities for SmarTrack CRM
 * Enforces ###-###-#### formatting while typing for US phone numbers.
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
 * Formats a raw phone string into standard US format ###-###-#### as user types.
 */
export function formatUSPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = extractUSPhoneDigits(value);

  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/**
 * Normalizes phone number to standard format (or digits) for database storage.
 */
export function normalizeUSPhone(value: string | null | undefined): string {
  if (!value) return '';
  return formatUSPhone(value);
}

/**
 * Validates if string represents a complete 10-digit US phone number.
 */
export function isValidUSPhoneLength(value: string | null | undefined): boolean {
  if (!value) return false;
  return extractUSPhoneDigits(value).length === 10;
}
