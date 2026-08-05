/**
 * Centralized SSN Formatting Utilities for SmarTrack CRM
 * Enforces ###-##-#### formatting while typing and ***-**-1234 masking.
 */

/**
 * Extracts digits only from string
 */
export function digitsOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Formats a raw string or digits into standard SSN format ###-##-#### as user types.
 */
export function formatSSN(value: string | null | undefined): string {
  if (!value) return '';
  const digits = digitsOnly(value).slice(0, 9);
  
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
}

/**
 * Normalizes SSN to 9 digits string (e.g. "123456789") or canonical formatted string.
 */
export function normalizeSSN(value: string | null | undefined): string {
  if (!value) return '';
  return digitsOnly(value).slice(0, 9);
}

/**
 * Masks SSN as ***-**-1234 for read-only displays.
 * If already masked (e.g. ***-**-1234 or ***-**-****), preserves or standardizes format.
 */
export function maskSSN(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value).trim();
  
  // If string contains asterisks or is already masked
  if (str.includes('*')) {
    const last4 = str.slice(-4);
    if (/^\d{4}$/.test(last4)) {
      return `***-**-${last4}`;
    }
    return '***-**-****';
  }

  const digits = digitsOnly(str);
  if (digits.length >= 4) {
    const last4 = digits.slice(-4);
    return `***-**-${last4}`;
  }
  
  return '***-**-****';
}

/**
 * Validates if string represents a complete 9-digit SSN.
 */
export function isValidSSNLength(value: string | null | undefined): boolean {
  if (!value) return false;
  return digitsOnly(value).length === 9;
}
