import { CsvPreviewResult, NormalizedCarrierRecord, CarrierStatusType } from './types';

/**
 * Robust CSV Line Parser handling quotes, commas within quotes, and escaped quotes.
 */
export function parseCsvContent(csvString: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuote = false;

  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    const nextChar = csvString[i + 1];

    if (insideQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip next quote
        } else {
          insideQuote = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.some((field) => field.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // skip \n
      } else if (char === '\r') {
        currentRow.push(currentField.trim());
        if (currentRow.some((field) => field.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

function normalizeStatus(val?: string | null): CarrierStatusType {
  if (!val) return 'active';
  const lower = val.toString().toLowerCase().trim();
  if (lower.includes('grace')) return 'grace_period';
  if (lower.includes('inactive') || lower.includes('term') || lower.includes('laps') || lower.includes('cancel')) {
    return 'inactive';
  }
  if (lower.includes('active')) return 'active';
  return 'active';
}

function parseCurrency(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = val.toString().replace(/[\$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
}

function parseBoolean(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (!val) return false;
  const s = val.toString().toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function parseDate(val: any): string | null {
  if (!val) return null;
  const str = val.toString().trim();
  if (!str) return null;

  // Handles MM/DD/YYYY or M/D/YYYY
  const mdYMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdYMatch) {
    const month = mdYMatch[1].padStart(2, '0');
    const day = mdYMatch[2].padStart(2, '0');
    const year = mdYMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Handles YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Get field value from row using case-insensitive header lookup with aliases.
 */
function getFieldValue(headerMap: Map<string, number>, row: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const index = headerMap.get(alias.toLowerCase());
    if (index !== undefined && index < row.length) {
      return row[index] || '';
    }
  }
  return '';
}

export function parseOscarCsv(csvContent: string): CsvPreviewResult {
  const rows = parseCsvContent(csvContent);
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headerRow = rows[0];
  const headerMap = new Map<string, number>();
  headerRow.forEach((h, idx) => {
    headerMap.set(h.toLowerCase().trim(), idx);
  });

  const requiredHeaderGroups = [
    { name: 'Member ID', aliases: ['member id', 'member_id', 'external_member_id', 'memberid'] },
    { name: 'Member Name', aliases: ['member name', 'member_name', 'name', 'full name', 'fullname'] },
  ];

  const missingHeaders: string[] = [];
  requiredHeaderGroups.forEach((group) => {
    const found = group.aliases.some((alias) => headerMap.has(alias.toLowerCase()));
    if (!found) {
      missingHeaders.push(group.name);
    }
  });

  if (missingHeaders.length > 0) {
    throw new Error(`Invalid Oscar CSV format. Missing required headers: ${missingHeaders.join(', ')}.`);
  }

  const records: NormalizedCarrierRecord[] = [];
  let activeCount = 0;
  let inactiveCount = 0;
  let gracePeriodCount = 0;
  let balanceDueCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const rawObject: Record<string, string> = {};
    headerRow.forEach((h, idx) => {
      rawObject[h] = row[idx] || '';
    });

    const memberId = getFieldValue(headerMap, row, ['Member ID', 'member_id', 'external_member_id', 'memberid']);
    const memberName = getFieldValue(headerMap, row, ['Member name', 'member_name', 'name', 'full name', 'fullname']);

    if (!memberId && !memberName) continue;

    const dobRaw = getFieldValue(headerMap, row, ['Date of birth', 'dob', 'date_of_birth', 'birthdate']);
    const emailRaw = getFieldValue(headerMap, row, ['Email', 'email address', 'e-mail']);
    const phoneRaw = getFieldValue(headerMap, row, ['Phone number', 'phone', 'phone_number', 'mobile']);
    const addressRaw = getFieldValue(headerMap, row, ['Mailing address', 'address', 'street address']);
    const stateRaw = getFieldValue(headerMap, row, ['State', 'st']);
    const enrollmentTypeRaw = getFieldValue(headerMap, row, ['Enrollment type', 'enrollment_type']);
    const onExchangeRaw = getFieldValue(headerMap, row, ['On exchange', 'on_exchange']);
    const planRaw = getFieldValue(headerMap, row, ['Plan', 'plan name', 'plan_name']);
    const balanceRaw = getFieldValue(headerMap, row, ['Balance', 'balance due', 'amount due']);
    const premiumRaw = getFieldValue(headerMap, row, ['Premium amount', 'premium', 'monthly premium']);
    const aptcRaw = getFieldValue(headerMap, row, ['APTC subsidy', 'aptc', 'subsidy']);
    const livesRaw = getFieldValue(headerMap, row, ['Lives', 'member count']);
    const startDateRaw = getFieldValue(headerMap, row, ['Coverage start date', 'effective date', 'start date']);
    const endDateRaw = getFieldValue(headerMap, row, ['Coverage end date', 'expiration date', 'end date']);
    const statusRaw = getFieldValue(headerMap, row, ['Policy status', 'status', 'state']);
    const autopayRaw = getFieldValue(headerMap, row, ['Autopay', 'auto pay']);
    const accountStatusRaw = getFieldValue(headerMap, row, ['Account creation status']);
    const ichraRaw = getFieldValue(headerMap, row, ['ICHRA member', 'ichra']);
    const fplRaw = getFieldValue(headerMap, row, ['Estimated FPL', 'fpl']);
    const verifNeededRaw = getFieldValue(headerMap, row, ['Policy holder verification needed']);
    const verifCompRaw = getFieldValue(headerMap, row, ['Policy holder verification completed']);

    const status = normalizeStatus(statusRaw);
    const balance = parseCurrency(balanceRaw);
    const premium = parseCurrency(premiumRaw);

    if (status === 'active') activeCount++;
    else if (status === 'inactive') inactiveCount++;
    else if (status === 'grace_period') gracePeriodCount++;

    if (balance > 0) balanceDueCount++;

    const normalizedRecord: NormalizedCarrierRecord = {
      external_member_id: memberId || `OSCAR-${i}`,
      member_name: memberName || 'Unknown Member',
      date_of_birth: parseDate(dobRaw),
      email: emailRaw.trim() || null,
      phone: phoneRaw.trim() || null,
      mailing_address: addressRaw.trim() || null,
      state: stateRaw.trim().toUpperCase() || null,
      enrollment_type: enrollmentTypeRaw.trim() || null,
      on_exchange: parseBoolean(onExchangeRaw),
      plan: planRaw.trim() || null,
      balance: balance,
      premium_amount: premium,
      aptc_subsidy: parseCurrency(aptcRaw),
      lives: parseInt(livesRaw, 10) || 1,
      coverage_start_date: parseDate(startDateRaw),
      coverage_end_date: parseDate(endDateRaw),
      carrier_status: status,
      autopay: parseBoolean(autopayRaw),
      account_creation_status: accountStatusRaw.trim() || null,
      ichra_member: parseBoolean(ichraRaw),
      estimated_fpl: fplRaw.trim() || null,
      verification_needed: verifNeededRaw.trim() || null,
      verification_completed: verifCompRaw.trim() || null,
      raw_data: rawObject,
    };

    records.push(normalizedRecord);
  }

  return {
    totalRows: records.length,
    activeCount,
    inactiveCount,
    gracePeriodCount,
    balanceDueCount,
    headers: headerRow,
    missingRequiredHeaders: [],
    records,
  };
}
