/**
 * Centralized Date Formatting Utilities for SmarTrack CRM
 * Enforces MM/DD/YYYY display without UTC timezone date-shifting bugs.
 */

/**
 * Extracts digits only from string
 */
export function digitsOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Converts ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ) to MM/DD/YYYY string.
 * Avoids new Date("YYYY-MM-DD") UTC date-shifting!
 */
export function isoDateToMMDDYYYY(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';

  // Match YYYY-MM-DD pattern directly
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    return `${month}/${day}/${y}`;
  }

  // Match MM/DD/YYYY pattern
  const mdyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    return `${month}/${day}/${y}`;
  }

  // Fallback for JS Date or timestamp string
  try {
    const dateObj = new Date(str);
    if (isNaN(dateObj.getTime())) return '';
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return '';
  }
}

/**
 * Converts MM/DD/YYYY or raw digits to ISO YYYY-MM-DD format for database persistence.
 */
export function mmddyyyyToISODate(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Match MM/DD/YYYY
  const mdyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    return `${y}-${month}-${day}`;
  }

  // Match MMDDYYYY digits
  const digits = digitsOnly(str);
  if (digits.length === 8) {
    const month = digits.slice(0, 2);
    const day = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    return `${year}-${month}-${day}`;
  }

  return '';
}

/**
 * Formats a date-only value to MM/DD/YYYY for UI display.
 */
export function formatDateMMDDYYYY(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const year = value.getFullYear();
    return `${month}/${day}/${year}`;
  }
  return isoDateToMMDDYYYY(String(value));
}

/**
 * Formats a timestamp or date-time value to MM/DD/YYYY hh:mm AM/PM.
 */
export function formatDateTimeMMDDYYYY(
  value: string | Date | null | undefined,
  includeTime = true,
  timezone?: string
): string {
  if (!value) return '';
  try {
    const dateObj = value instanceof Date ? value : new Date(value);
    if (isNaN(dateObj.getTime())) return '';

    const options: Intl.DateTimeFormatOptions = {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
      ...(timezone ? { timeZone: timezone } : {})
    };

    return new Intl.DateTimeFormat('en-US', options).format(dateObj);
  } catch {
    return formatDateMMDDYYYY(value);
  }
}

/**
 * Validates if string represents a valid date in MM/DD/YYYY format.
 */
export function isValidMMDDYYYY(value: string | null | undefined): boolean {
  if (!value) return false;
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const [, mStr, dStr, yStr] = match;
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  const y = parseInt(yStr, 10);

  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 1900 || y > 2100) return false;

  const dateObj = new Date(y, m - 1, d);
  return (
    dateObj.getFullYear() === y &&
    dateObj.getMonth() === m - 1 &&
    dateObj.getDate() === d
  );
}

/**
 * Dynamic input formatter for typing dates as MM/DD/YYYY
 */
export function formatTypingDateMMDDYYYY(value: string | null | undefined): string {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}
