import { NormalizedCarrierRecord } from '../types';

/**
 * Parses raw Ambetter Broker Portal CSV content into generic NormalizedCarrierRecord objects.
 * NO synthetic/mock fallbacks. If required identifiers (Member ID) are missing, records are skipped or throw.
 */
export function parseAmbetterCsv(csvContent: string): NormalizedCarrierRecord[] {
  if (!csvContent || !csvContent.trim()) {
    throw new Error('Ambetter CSV content is empty.');
  }

  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new Error('Ambetter CSV file contains no data rows.');
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().trim());

  // Find column indexes
  const colMemberId = findColumnIdx(headers, ['member id', 'subscriber id', 'policy number', 'member_id', 'policy_id', 'id']);
  const colName = findColumnIdx(headers, ['member name', 'subscriber name', 'client name', 'name', 'full name']);
  const colFirstName = findColumnIdx(headers, ['first name', 'member first name', 'subscriber first name']);
  const colLastName = findColumnIdx(headers, ['last name', 'member last name', 'subscriber last name']);
  const colDob = findColumnIdx(headers, ['date of birth', 'dob', 'birth date']);
  const colEmail = findColumnIdx(headers, ['email', 'email address', 'member email']);
  const colPhone = findColumnIdx(headers, ['phone', 'phone number', 'telephone']);
  const colState = findColumnIdx(headers, ['state', 'residence state']);
  const colPlan = findColumnIdx(headers, ['plan', 'plan name', 'product', 'coverage plan']);
  const colPremium = findColumnIdx(headers, ['member responsibility', 'premium', 'premium amount', 'monthly premium', 'total premium']);
  const colBalance = findColumnIdx(headers, ['balance', 'balance due', 'amount due', 'overdue balance']);
  const colStart = findColumnIdx(headers, ['policy effective date', 'coverage start date', 'start date', 'coverage start', 'effective date']);
  const colEnd = findColumnIdx(headers, ['policy term date', 'coverage end date', 'end date', 'expiration date', 'term date']);
  const colStatus = findColumnIdx(headers, ['status', 'policy status', 'member status', 'coverage status']);
  const colAutopay = findColumnIdx(headers, ['autopay', 'auto pay', 'automatic payment']);
  const colPaymentCurrentAmountDetail = findColumnIdx(headers, ['payment current amount detail']);
  const colPaidThroughDateDetail = findColumnIdx(headers, ['paid through date detail']);
  const colDelinquencyStatusDetail = findColumnIdx(headers, ['delinquency status detail', 'payment delinquency status']);
  const colLastPaymentDateDetail = findColumnIdx(headers, ['last payment date detail']);
  const colAutopayStatusDetail = findColumnIdx(headers, ['autopay status detail']);
  const colPaymentEnrichmentStatus = findColumnIdx(headers, ['payment enrichment status']);
  const colPaymentEnrichedAt = findColumnIdx(headers, ['payment enriched at']);
  const colPaymentEnrichmentError = findColumnIdx(headers, ['payment enrichment error']);
  const colPaymentDetailSource = findColumnIdx(headers, ['payment detail source']);

  if (colMemberId === -1 && colName === -1 && colFirstName === -1) {
    throw new Error('Ambetter CSV missing required Member ID or Name column headers.');
  }

  const records: NormalizedCarrierRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length === 0) continue;

    const memberId = colMemberId !== -1 ? row[colMemberId]?.trim() : `AMB-${i}`;
    let memberName = '';
    if (colFirstName !== -1 && colLastName !== -1) {
      const fn = row[colFirstName]?.trim() || '';
      const ln = row[colLastName]?.trim() || '';
      memberName = `${fn} ${ln}`.trim();
    } else if (colName !== -1) {
      memberName = row[colName]?.trim() || '';
    }

    if (!memberId && !memberName) continue;

    // Raw balance & premium cleanup
    const rawBalance = colBalance !== -1 ? row[colBalance] : '0';
    const balance = parseCurrency(rawBalance);

    const rawPremium = colPremium !== -1 ? row[colPremium] : '0';
    const premium_amount = parseCurrency(rawPremium);

    const coverageStartDate = colStart !== -1 ? formatDateValue(row[colStart]) : null;
    const coverageEndDate = colEnd !== -1 ? formatDateValue(row[colEnd]) : null;

    // Status normalization
    const rawStatus = colStatus !== -1 ? row[colStatus]?.toLowerCase() || '' : 'active';
    let carrier_status: 'active' | 'grace_period' | 'inactive' = 'active';

    if (rawStatus.includes('grace') || rawStatus.includes('delinquent') || rawStatus.includes('pending cancel')) {
      carrier_status = 'grace_period';
    } else if (
      rawStatus.includes('inact') ||
      rawStatus.includes('term') ||
      rawStatus.includes('cancel') ||
      rawStatus.includes('expir')
    ) {
      carrier_status = 'inactive';
    }

    if (carrier_status === 'active' && !isPolicyDateActive(coverageStartDate, coverageEndDate)) {
      carrier_status = 'inactive';
    }

    // Autopay normalization
    const rawAutopay = colAutopay !== -1 ? row[colAutopay]?.toLowerCase() || '' : '';
    const autopay = rawAutopay === 'yes' || rawAutopay === 'true' || rawAutopay === '1' || rawAutopay === 'on';

    const rawData: Record<string, string | number | null> = { rowLine: lines[i] };
    const detailCurrentAmount = colPaymentCurrentAmountDetail !== -1 ? parseOptionalCurrency(row[colPaymentCurrentAmountDetail]) : null;
    const detailPaidThrough = getOptionalCell(row, colPaidThroughDateDetail);
    const detailDelinquencyStatus = normalizeDelinquencyStatusDetail(getOptionalCell(row, colDelinquencyStatusDetail));
    const detailLastPaymentDate = getOptionalCell(row, colLastPaymentDateDetail);
    const detailAutopayStatus = normalizeAutopayStatusDetail(getOptionalCell(row, colAutopayStatusDetail));
    const enrichmentStatus = normalizePaymentEnrichmentStatus(getOptionalCell(row, colPaymentEnrichmentStatus));
    const enrichmentTimestamp = getOptionalCell(row, colPaymentEnrichedAt);
    const enrichmentError = getOptionalCell(row, colPaymentEnrichmentError);
    const paymentDetailSource = normalizePaymentDetailSource(getOptionalCell(row, colPaymentDetailSource));

    if (colPaymentCurrentAmountDetail !== -1) rawData.payment_current_amount = detailCurrentAmount;
    if (detailPaidThrough) rawData.paid_through_date_detail = detailPaidThrough;
    if (detailDelinquencyStatus) rawData.delinquency_status = detailDelinquencyStatus;
    if (detailLastPaymentDate) rawData.last_payment_date = detailLastPaymentDate;
    if (detailAutopayStatus) rawData.autopay_status = detailAutopayStatus;
    if (enrichmentStatus) rawData.payment_enrichment_status = enrichmentStatus;
    if (enrichmentTimestamp) rawData.payment_enriched_at = enrichmentTimestamp;
    if (enrichmentError) rawData.payment_enrichment_error = enrichmentError;
    if (paymentDetailSource) rawData.payment_detail_source = paymentDetailSource;

    records.push({
      external_member_id: memberId,
      member_name: memberName || 'Name Unavailable',
      date_of_birth: colDob !== -1 ? formatDateValue(row[colDob]) : null,
      email: colEmail !== -1 ? row[colEmail]?.trim() || null : null,
      phone: colPhone !== -1 ? row[colPhone]?.trim() || null : null,
      state: colState !== -1 ? row[colState]?.trim() || 'FL' : 'FL',
      plan: colPlan !== -1 ? row[colPlan]?.trim() || 'Ambetter Marketplace Plan' : 'Ambetter Marketplace Plan',
      premium_amount,
      balance,
      coverage_start_date: coverageStartDate,
      coverage_end_date: coverageEndDate,
      carrier_status,
      autopay,
      on_exchange: true,
      aptc_subsidy: 0,
      lives: 1,
      ichra_member: false,
      raw_data: rawData,
    });
  }

  return records;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function findColumnIdx(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseCurrency(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseOptionalCurrency(val: string | undefined): number | null {
  if (!val || !val.trim()) return null;
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getOptionalCell(row: string[], index: number): string | null {
  if (index === -1) return null;
  const value = row[index]?.trim();
  return value ? value : null;
}

function normalizeAutopayStatusDetail(value: string | null): 'enrolled' | 'not_enrolled' | 'unknown' | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'enrolled' || normalized === 'not_enrolled' || normalized === 'unknown') {
    return normalized;
  }
  if (normalized.includes('not')) return 'not_enrolled';
  if (normalized.includes('enrolled') || normalized === 'yes' || normalized === 'true' || normalized === 'on') {
    return 'enrolled';
  }
  return 'unknown';
}

function normalizeDelinquencyStatusDetail(value: string | null): string | null {
  const normalized = value?.trim() || '';
  if (!normalized || normalized === '-') return null;
  return normalized;
}

function normalizePaymentEnrichmentStatus(
  value: string | null
): 'enriched' | 'no_current_invoice' | 'parse_failed' | 'page_failed' | 'session_failed' | 'failed' | 'skipped_inactive' | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (
    normalized === 'enriched' ||
    normalized === 'no_current_invoice' ||
    normalized === 'parse_failed' ||
    normalized === 'page_failed' ||
    normalized === 'session_failed' ||
    normalized === 'failed' ||
    normalized === 'skipped_inactive'
  ) {
    return normalized;
  }
  return null;
}

function normalizePaymentDetailSource(value: string | null): 'direct' | 'fallback' | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'direct' || normalized === 'fallback') {
    return normalized;
  }
  return null;
}

function formatDateValue(val: string | undefined): string | null {
  if (!val || !val.trim()) return null;
  const trimmed = val.trim();
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return trimmed;
  return d.toISOString().split('T')[0];
}

function isPolicyDateActive(startDate: string | null, endDate: string | null): boolean {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (startDate && startDate > today) return false;
  if (!endDate || endDate.startsWith('9999')) return true;
  return endDate >= today;
}
