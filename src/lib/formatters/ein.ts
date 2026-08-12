/**
 * Centralized EIN Formatting Utilities for SmarTrack CRM
 * Enforces XX-XXXXXXX formatting for Commercial Company Profiles (9 digits max).
 */

export function digitsOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Formats a raw string or digits into standard EIN format XX-XXXXXXX as user types.
 */
export function formatEIN(value: string | null | undefined): string {
  if (!value) return '';
  const digits = digitsOnly(value).slice(0, 9);
  
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * Validates if string represents a complete 9-digit EIN.
 */
export function isValidEINLength(value: string | null | undefined): boolean {
  if (!value) return false;
  return digitsOnly(value).length === 9;
}
