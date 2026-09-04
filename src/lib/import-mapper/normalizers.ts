import { ImportCell, NormalizationIssue } from './types';

const STATE_MAP: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  puerto: 'PR',
  'puerto rico': 'PR',
};

export function cellToString(value: ImportCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function normalizeDate(value: ImportCell | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.round(value) * 86400000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const usMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (usMatch) {
    const year = normalizeYear(Number(usMatch[3]));
    return toIsoDate(year, Number(usMatch[1]), Number(usMatch[2]));
  }

  return null;
}

export function normalizeState(value: ImportCell | undefined): string | null {
  const text = cellToString(value);
  if (!text) return null;
  const clean = text.trim();
  if (/^[A-Za-z]{2}$/.test(clean)) return clean.toUpperCase();
  return STATE_MAP[clean.toLowerCase()] ?? clean.toUpperCase();
}

export function normalizeZip(value: ImportCell | undefined): string | null {
  const text = cellToString(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length < 5) return null;
  if (digits.length === 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
}

export function normalizePhone(value: ImportCell | undefined): string | null {
  const text = cellToString(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return text.trim();
}

export function normalizeSsn(
  value: ImportCell | undefined,
  issues?: NormalizationIssue[]
): string | null {
  const text = cellToString(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 9) {
    issues?.push({
      field: 'client.ssn',
      severity: 'warning',
      message: 'SSN was not stored because it is not 9 digits.',
    });
    return null;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function normalizeMoney(value: ImportCell | undefined): number | null {
  const text = cellToString(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

export function normalizeEmail(value: ImportCell | undefined): string | null {
  const text = cellToString(value);
  if (!text) return null;
  const email = text.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : text;
}

export function splitFullName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 50 ? 1900 + year : 2000 + year;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}
