/**
 * Centralized Carrier Payment Semantics Module.
 * Enforces unified, canonical payment_due, amount_due, and AutoPay rules across API, Overview, and Payments Tab.
 */

export interface CarrierPaymentStatus {
  isActive: boolean;
  paymentDue: boolean;
  paymentStatusLabel: 'Grace Period' | 'Delinquent' | 'Payment Due' | 'Paid' | 'Unknown';
  paidThroughDate: string | null;
  lastPaymentDate: string | null;
  suggestedAction: string | null;
  amountDue: number; // Numeric overdue amount to sum for Total Balance Due
  amountDueFormatted: string; // User-facing string e.g. '$43.11' or 'Unavailable'
  autopayStatus: 'enrolled' | 'not_enrolled' | 'unknown';
}

interface CarrierPaymentRecord {
  carrier?: string | null;
  carrier_status?: string | null;
  paid_through_date?: string | null;
  autopay?: boolean | string | null;
  balance?: number | string | null;
  raw_data?: Record<string, unknown> | null;
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((s) => s.replace(/^["']|["']$/g, ''));
}

function toIsoDate(d: string): string {
  if (!d || d === '-' || d.trim() === '') return '';
  const parts = d.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return d.substring(0, 10);
}

/**
 * Calculates canonical payment status, amount due, and AutoPay for a carrier record.
 * @param record Normalized DB carrier_record object
 * @param todayStr Local business timezone date string in 'YYYY-MM-DD' format (e.g. '2026-08-25')
 */
export function getCarrierPaymentStatus(record: CarrierPaymentRecord, todayStr?: string): CarrierPaymentStatus {
  const carrier = (record.carrier || '').toLowerCase();
  const carrierStatus = (record.carrier_status || '').toLowerCase();
  const today = todayStr || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  let isActive = true;
  let paymentDue = false;
  let paymentStatusLabel: 'Grace Period' | 'Delinquent' | 'Payment Due' | 'Paid' | 'Unknown' = 'Paid';
  let paidThroughDate: string | null = record.paid_through_date || null;
  let lastPaymentDate: string | null = null;
  let suggestedAction: string | null = null;
  let amountDue = 0;
  let amountDueFormatted = 'Unavailable';
  let autopayStatus: 'enrolled' | 'not_enrolled' | 'unknown' = 'unknown';

  const rawData = record.raw_data || {};

  if (carrier === 'oscar') {
    // AutoPay normalization for Oscar
    const ap = rawData['AutoPay'] ?? record.autopay;
    if (ap === true || ap === 'true' || ap === 'Enrolled' || ap === 'Yes') {
      autopayStatus = 'enrolled';
    } else if (ap === false || ap === 'false' || ap === 'Not Enrolled' || ap === 'No') {
      autopayStatus = 'not_enrolled';
    } else {
      autopayStatus = 'unknown';
    }

    // Oscar Payment Due Rule: ONLY grace_period or delinquent
    if (carrierStatus === 'grace_period') {
      isActive = true;
      paymentDue = true;
      paymentStatusLabel = 'Grace Period';
      amountDue = Number(record.balance || 0);
      amountDueFormatted = `$${amountDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else if (carrierStatus === 'delinquent') {
      isActive = true;
      paymentDue = true;
      paymentStatusLabel = 'Delinquent';
      amountDue = Number(record.balance || 0);
      amountDueFormatted = `$${amountDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else {
      // Active-normal policies or terminated policies are NOT Payment Due
      isActive = carrierStatus === 'active' || carrierStatus === '';
      paymentDue = false;
      paymentStatusLabel = 'Paid';
      amountDue = 0;
      amountDueFormatted = '$0.00';
    }

  } else if (carrier === 'ambetter') {
    // Check enriched AutoPay status from Payments/Invoices detail page if available
    const enrichedAutopay = rawData.autopay_status;
    if (enrichedAutopay === 'enrolled' || enrichedAutopay === 'not_enrolled') {
      autopayStatus = enrichedAutopay;
    } else {
      const ap = rawData['AutoPay'] ?? record.autopay;
      if (ap === true || ap === 'true' || ap === 'Enrolled' || ap === 'Yes') {
        autopayStatus = 'enrolled';
      } else if (ap === false || ap === 'false' || ap === 'Not Enrolled' || ap === 'No') {
        autopayStatus = 'not_enrolled';
      } else {
        autopayStatus = 'unknown';
      }
    }

    const rawLine = typeof rawData.rowLine === 'string' ? rawData.rowLine : '';
    if (rawLine) {
      const cols = parseCsvLine(rawLine);
      const brokerTerm = cols[6] || '';
      const policyEff = cols[7] || '';
      const policyTerm = cols[8] || '';
      const paidThruRaw = cols[9] || '';
      suggestedAction = cols[16] && cols[16] !== '-' ? cols[16] : null;

      const polEffIso = toIsoDate(policyEff);
      const polTermIso = toIsoDate(policyTerm);
      const brokTermIso = toIsoDate(brokerTerm);

      if (polEffIso && polEffIso <= today) {
        const isPolActive = !polTermIso || polTermIso.startsWith('9999') || polTermIso >= today;
        const isBrokActive = !brokTermIso || brokTermIso.startsWith('9999') || brokTermIso >= today;
        isActive = isPolActive && isBrokActive;
      } else {
        isActive = false;
      }

      if (paidThruRaw && paidThruRaw !== '-' && paidThruRaw.trim() !== '') {
        paidThroughDate = paidThruRaw;
      }
    } else {
      isActive = carrierStatus === 'active' || carrierStatus === '';
    }

    const enrichmentStatus = rawData.payment_enrichment_status;
    const detailPaidThroughDate = typeof rawData.paid_through_date_detail === 'string'
      ? rawData.paid_through_date_detail
      : null;
    const delinquencyStatus = normalizeAmbetterDelinquencyStatus(rawData.delinquency_status);
    const currentAmount = typeof rawData.payment_current_amount === 'number' && Number.isFinite(rawData.payment_current_amount)
      ? rawData.payment_current_amount
      : null;

    if (typeof rawData.last_payment_date === 'string' && rawData.last_payment_date) {
      lastPaymentDate = rawData.last_payment_date;
    }

    const hasExplicitDelinquency = carrierStatus === 'grace_period' || carrierStatus === 'delinquent';
    if (detailPaidThroughDate) {
      paidThroughDate = detailPaidThroughDate;
    }

    if (!isActive || carrierStatus === 'inactive') {
      paymentDue = false;
      paymentStatusLabel = 'Paid';
      amountDue = 0;
      amountDueFormatted = '$0.00';
    } else if (enrichmentStatus === 'failed') {
      paymentDue = false;
      paymentStatusLabel = 'Unknown';
      paidThroughDate = null;
      amountDue = 0;
      amountDueFormatted = 'Unavailable';
    } else if (enrichmentStatus === 'enriched') {
      if (currentAmount === null) {
        paymentDue = false;
        paymentStatusLabel = 'Unknown';
        amountDue = 0;
        amountDueFormatted = 'Unavailable';
      } else if (currentAmount > 0 && delinquencyStatus) {
        paymentDue = true;
        paymentStatusLabel = hasExplicitDelinquency || delinquencyStatus
          ? (carrierStatus === 'grace_period' ? 'Grace Period' : 'Delinquent')
          : 'Payment Due';
        amountDue = currentAmount;
        amountDueFormatted = `$${currentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      } else {
        paymentDue = false;
        paymentStatusLabel = 'Paid';
        amountDue = 0;
        amountDueFormatted = '$0.00';
      }
    } else {
      // Legacy Ambetter rows without member-level payment verification retain the old list-level fallback.
      let isPastPaidThru = false;
      if (paidThroughDate) {
        const ptIso = toIsoDate(paidThroughDate);
        if (ptIso && ptIso < today) {
          isPastPaidThru = true;
        }
      }

      if (isActive && (hasExplicitDelinquency || isPastPaidThru)) {
        paymentDue = true;
        paymentStatusLabel = hasExplicitDelinquency
          ? (carrierStatus === 'grace_period' ? 'Grace Period' : 'Delinquent')
          : 'Payment Due';
        amountDue = currentAmount && currentAmount > 0 ? currentAmount : 0;
        amountDueFormatted = currentAmount && currentAmount > 0
          ? `$${currentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          : 'Unavailable';
      } else {
        paymentDue = false;
        paymentStatusLabel = 'Paid';
        amountDue = 0;
        amountDueFormatted = '$0.00';
      }
    }
  }

  return {
    isActive,
    paymentDue,
    paymentStatusLabel,
    paidThroughDate,
    lastPaymentDate,
    suggestedAction,
    amountDue,
    amountDueFormatted,
    autopayStatus,
  };
}

function normalizeAmbetterDelinquencyStatus(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized === '-') return null;
  return normalized;
}
