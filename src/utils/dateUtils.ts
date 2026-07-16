/**
 * Converts a database date string (YYYY-MM-DD) safely to US format (MM/DD/YYYY).
 * Prevents timezone shifting.
 */
export const formatIsoToUsDate = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'Not provided';
  const parts = isoStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${month}/${day}/${year}`;
  }
  return isoStr;
};

/**
 * Parses a US date input string (MM/DD/YYYY) safely to ISO format (YYYY-MM-DD).
 * Returns null if the format is invalid.
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
  
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Calculates readable calendar-based term duration between two dates.
 * Excludes day approximation division by 30.
 */
export const calculateTermDuration = (effStr: string | null | undefined, expStr: string | null | undefined): string => {
  if (!effStr || !expStr) return 'Not provided';
  
  // Format inputs to standard ISO if they are not already
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
    // Get number of days in start month to adjust
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
