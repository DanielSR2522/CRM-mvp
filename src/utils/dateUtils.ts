/**
 * Converts a database date string (YYYY-MM-DD) safely to US format (MM/DD/YYYY).
 * Prevents timezone shifting.
 */
export const formatIsoToUsDate = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'Not provided';
  const clean = isoStr.trim().split('T')[0].split(' ')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4 && month.length <= 2 && day.length <= 2) {
      return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    }
  }
  return isoStr;
};

/**
 * Formats a full ISO timestamp string into US date and time format: MM/DD/YYYY, hh:mm AM/PM.
 * Uses explicit 'en-US' locale to avoid browser language defaults.
 */
export const formatDateTimeToUs = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'Not provided';
  try {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return isoStr;
    const datePart = date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
    const timePart = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return isoStr;
  }
};

/**
 * Parses a US date input string (MM/DD/YYYY) safely to ISO format (YYYY-MM-DD).
 * Returns null if the format is invalid or if the date is not a real calendar date (e.g. 02/30/2026).
 */
export const usDateToIso = (usStr: string | null | undefined): string | null => {
  if (!usStr) return null;
  const clean = usStr.trim();
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  
  const [, month, day, year] = match;
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1000 || y > 9999) return null;

  // Validate exact calendar day (e.g., rejects 02/30/2026)
  const testDate = new Date(y, m - 1, d);
  if (testDate.getFullYear() !== y || testDate.getMonth() !== m - 1 || testDate.getDate() !== d) {
    return null;
  }
  
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Calculates readable calendar-based term duration between two dates.
 * Excludes day approximation division by 30.
 */
export const calculateTermDuration = (effStr: string | null | undefined, expStr: string | null | undefined): string => {
  if (!effStr || !expStr) return 'Not provided';
  
  const startIso = effStr.includes('/') ? usDateToIso(effStr) : effStr;
  const endIso = expStr.includes('/') ? usDateToIso(expStr) : expStr;
  
  if (!startIso || !endIso) return 'Not provided';
  
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Not provided';
  if (end < start) return 'Invalid dates';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  }
  
  if (parts.length === 0) {
    if (days > 0) {
      parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    } else {
      parts.push('0 days');
    }
  }

  return parts.join(', ');
};

/**
 * Formats a text input as MM/DD/YYYY as the user types.
 */
export const formatAsDateInput = (val: string): string => {
  let clean = val.replace(/[^0-9]/g, '');
  if (clean.length > 8) {
    clean = clean.slice(0, 8);
  }
  if (clean.length > 4) {
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
  } else if (clean.length > 2) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  }
  return clean;
};

/**
 * Parses US date string (MM/DD/YYYY), 12-hour hour ("01"-"12"), minute ("00"-"59"), and AM/PM into a local Date object.
 */
export const parseUsDateAnd12hTimeToDate = (
  usDateStr: string,
  hour12Str: string,
  minuteStr: string,
  ampm: string
): Date | null => {
  const isoDate = usDateToIso(usDateStr);
  if (!isoDate) return null;

  const [y, m, d] = isoDate.split('-').map(Number);
  let h = parseInt(hour12Str, 10);
  const min = parseInt(minuteStr, 10);

  if (isNaN(h) || h < 1 || h > 12) return null;
  if (isNaN(min) || min < 0 || min > 59) return null;

  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;

  const result = new Date(y, m - 1, d, h, min, 0, 0);
  if (isNaN(result.getTime())) return null;
  return result;
};

/**
 * Extracts US date string (MM/DD/YYYY), 12-hour hour ("01"-"12"), minute ("00"-"59"), and AM/PM from a Date or ISO timestamp.
 */
export const extractUsDateAnd12hTime = (isoOrDate: Date | string | null | undefined) => {
  if (!isoOrDate) {
    const now = new Date();
    return {
      dateUs: formatIsoToUsDate(now.toISOString().split('T')[0]),
      hour12: '09',
      minute: '00',
      ampm: 'AM' as 'AM' | 'PM',
    };
  }

  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(date.getTime())) {
    const now = new Date();
    return {
      dateUs: formatIsoToUsDate(now.toISOString().split('T')[0]),
      hour12: '09',
      minute: '00',
      ampm: 'AM' as 'AM' | 'PM',
    };
  }

  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  const dateUs = `${mm}/${dd}/${yyyy}`;

  let hours = date.getHours();
  const ampm: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const hour12 = String(hours).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return { dateUs, hour12, minute, ampm };
};
