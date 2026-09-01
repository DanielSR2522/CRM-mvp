/**
 * Centralized Date & Time Formatting Utilities for Carrier Portals.
 * Enforces strict MM/DD/YYYY format for dates and MM/DD/YYYY hh:mm A for datetimes.
 */

/**
 * Formats any Date input (string, Date, number, null) to `MM/DD/YYYY`.
 * Example: '2026-08-24' or '2026-08-24T21:30:00Z' -> '08/24/2026'
 */
export function formatDateMMDDYYYY(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return 'N/A';

  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);

    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const year = d.getUTCFullYear();

    return `${month}/${day}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats any Date input to `MM/DD/YYYY hh:mm A`.
 * Example: '2026-08-24T21:33:00Z' -> '08/24/2026 09:33 PM'
 */
export function formatDateTimeMMDDYYYY(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return 'N/A';

  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);

    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    const formattedHours = String(hours).padStart(2, '0');

    return `${month}/${day}/${year} ${formattedHours}:${minutes} ${ampm}`;
  } catch {
    return String(dateInput);
  }
}
