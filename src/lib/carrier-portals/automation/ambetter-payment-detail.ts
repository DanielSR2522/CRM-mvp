import type { BrowserContext, Page } from 'playwright';

export type AmbetterPaymentEnrichmentStatus =
  | 'enriched'
  | 'no_current_invoice'
  | 'parse_failed'
  | 'page_failed'
  | 'session_failed'
  | 'skipped_inactive'
  | 'failed';
export type AmbetterAutopayStatus = 'enrolled' | 'not_enrolled' | 'unknown';
export type AmbetterPaymentDetailSource = 'direct' | 'fallback';

export interface AmbetterPaymentDetail {
  paid_through_date_detail: string | null;
  payment_current_amount: number | null;
  delinquency_status: string | null;
  last_payment_date: string | null;
  autopay_status: AmbetterAutopayStatus;
  payment_detail_source?: AmbetterPaymentDetailSource | null;
}

export interface AmbetterPaymentEnrichment extends AmbetterPaymentDetail {
  payment_enrichment_status: AmbetterPaymentEnrichmentStatus;
  payment_enriched_at: string;
  payment_enrichment_error: string | null;
  payment_detail_source: AmbetterPaymentDetailSource | null;
}

const PAYMENT_TEXT_PATTERN = /Current Amount|Paid Through|Last Payment Date|AutoPay|Payment Amount|Invoice Number/i;
const REQUIRED_PAYMENT_TEXT_PATTERN = /Current Amount|Paid Through/i;
const DELINQUENCY_STATUS_PATTERN = /Delinquency Status/i;
export const AMBETTER_SESSION_EXPIRED_PATTERN = /sign in to your account|enter your password|forgot your password/i;

export class AmbetterPaymentDetailError extends Error {
  readonly status: AmbetterPaymentEnrichmentStatus;

  constructor(status: AmbetterPaymentEnrichmentStatus, message: string) {
    super(message);
    this.name = 'AmbetterPaymentDetailError';
    this.status = status;
  }
}

export function buildAmbetterPaymentInvoiceUrl(policyNumber: string): string {
  const encoded = encodeURIComponent(policyNumber);
  return `https://broker.ambetterhealth.com/s/brokerportal-paymentandinvoice?nbr=${encoded}&c__nbr=${encoded}`;
}

export function buildAmbetterPolicyDetailUrl(policyNumber: string): string {
  const encoded = encodeURIComponent(policyNumber);
  return `https://broker.ambetterhealth.com/s/policy?nbr=${encoded}&c__nbr=${encoded}`;
}

export function parseAmbetterPaymentDetailText(text: string): AmbetterPaymentDetail {
  const currentAmountMatch = text.match(/Current Amount\s*:?\s*\$?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const paidThroughMatch = text.match(/Paid Through\s*:?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
  const delinquencyStatus = extractLabeledValue(text, 'Delinquency Status');
  const lastPaymentMatch = text.match(/Last Payment Date\s*:?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
  const autoPayMatch = text.match(/(?:^|[^A-Za-z])AutoPay\s*:\s*([\s\S]*?)(?=Current Amount|Paid Through|Last Payment Date|Navigation Mode|Type\s+Invoice Number|Invoice Number|Payment Amount|Payment Date|Payment Method|Contact Us|$)/i);
  const currentAmount = currentAmountMatch ? parseFloat(currentAmountMatch[1].replace(/,/g, '')) : NaN;

  return {
    paid_through_date_detail: paidThroughMatch ? paidThroughMatch[1].trim() : null,
    payment_current_amount: Number.isFinite(currentAmount) ? currentAmount : null,
    delinquency_status: normalizeDelinquencyStatus(delinquencyStatus),
    last_payment_date: normalizeLastPaymentDate(lastPaymentMatch ? lastPaymentMatch[1].trim() : null),
    autopay_status: normalizeAutopayStatus(autoPayMatch ? autoPayMatch[1] : null),
  };
}

export async function extractAmbetterPaymentDetail(
  page: Page,
  context: BrowserContext,
  policyNumber: string,
  options: { navigationTimeoutMs?: number; contentTimeoutMs?: number } = {}
): Promise<AmbetterPaymentDetail> {
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 35000;
  const contentTimeoutMs = options.contentTimeoutMs ?? 12000;

  let directText: string | null = null;
  try {
    directText = await readPaymentInvoiceViaDirectUrl(page, policyNumber, navigationTimeoutMs, contentTimeoutMs);
  } catch (error) {
    if (isSessionError(error)) throw error;
  }
  if (directText) {
    return parseRequiredAmbetterPaymentDetail(directText, 'direct');
  }

  let fallbackText: string | null = null;
  try {
    fallbackText = await readPaymentInvoiceViaDetailClick(
      page,
      context,
      policyNumber,
      navigationTimeoutMs,
      contentTimeoutMs
    );
  } catch (error) {
    if (isSessionError(error) || error instanceof AmbetterPaymentDetailError) throw error;
    throw new AmbetterPaymentDetailError('page_failed', getErrorMessage(error));
  }
  if (fallbackText) {
    return parseRequiredAmbetterPaymentDetail(fallbackText, 'fallback');
  }

  throw new AmbetterPaymentDetailError(
    'page_failed',
    'Ambetter payment detail page could not be reached or did not load readable payment content.'
  );
}

export function createFailedAmbetterPaymentEnrichment(error: unknown): AmbetterPaymentEnrichment {
  const status = error instanceof AmbetterPaymentDetailError ? error.status : 'page_failed';

  return {
    paid_through_date_detail: null,
    payment_current_amount: null,
    delinquency_status: null,
    last_payment_date: null,
    autopay_status: 'unknown',
    payment_detail_source: null,
    payment_enrichment_status: status,
    payment_enriched_at: new Date().toISOString(),
    payment_enrichment_error: getErrorMessage(error),
  };
}

async function readPaymentInvoiceViaDirectUrl(
  page: Page,
  policyNumber: string,
  navigationTimeoutMs: number,
  contentTimeoutMs: number
): Promise<string | null> {
  const url = buildAmbetterPaymentInvoiceUrl(policyNumber);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
  } catch (error) {
    throw new AmbetterPaymentDetailError('page_failed', getErrorMessage(error));
  }
  return readPaymentText(page, contentTimeoutMs);
}

async function readPaymentInvoiceViaDetailClick(
  page: Page,
  context: BrowserContext,
  policyNumber: string,
  navigationTimeoutMs: number,
  contentTimeoutMs: number
): Promise<string | null> {
  const detailUrl = buildAmbetterPolicyDetailUrl(policyNumber);
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
  } catch (error) {
    throw new AmbetterPaymentDetailError('page_failed', getErrorMessage(error));
  }
  await page.waitForTimeout(3000);

  const frame = page.frames().find((f) => f.url().includes('vlocity_ins__universalcardpage') || f.url().includes('apex'));
  if (!frame) throw new AmbetterPaymentDetailError('page_failed', 'Ambetter policy detail frame was not found.');

  const detailText = await frame.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
  if (!detailText.includes(policyNumber)) {
    throw new AmbetterPaymentDetailError('page_failed', 'Ambetter policy detail did not contain the requested policy number.');
  }

  const button = frame.locator('a.btn:has-text("View Payments/Invoices"), a:has-text("View Payments")').first();
  if ((await button.count()) === 0) {
    throw new AmbetterPaymentDetailError('page_failed', 'Ambetter View Payments/Invoices link was not found.');
  }

  const [popupPage] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
    button.click({ force: true }),
  ]);

  const targetPage = popupPage || page;
  return readPaymentText(targetPage, contentTimeoutMs);
}

async function readPaymentText(page: Page, contentTimeoutMs: number): Promise<string | null> {
  const attempts = Math.max(1, Math.ceil(contentTimeoutMs / 1000));
  let bestPaymentText: string | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    await page.waitForTimeout(1000);
    const pageText = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
    if (AMBETTER_SESSION_EXPIRED_PATTERN.test(page.url()) || AMBETTER_SESSION_EXPIRED_PATTERN.test(pageText)) {
      throw new AmbetterPaymentDetailError('session_failed', 'Ambetter portal session expired while reading payment detail.');
    }
    const pageDetail = getParseableRequiredPaymentDetail(pageText);
    if (pageDetail) {
      bestPaymentText = pageText;
      if (hasDelinquencyStatusLabel(pageText)) return pageText;
    }

    for (const frame of page.frames()) {
      const frameText = await frame.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
      if (AMBETTER_SESSION_EXPIRED_PATTERN.test(frame.url()) || AMBETTER_SESSION_EXPIRED_PATTERN.test(frameText)) {
        throw new AmbetterPaymentDetailError('session_failed', 'Ambetter portal session expired while reading payment detail.');
      }
      const frameDetail = getParseableRequiredPaymentDetail(frameText);
      if (frameDetail) {
        bestPaymentText = frameText;
        if (hasDelinquencyStatusLabel(frameText)) return frameText;
      }
    }
  }

  if (bestPaymentText) return bestPaymentText;

  const finalText = await collectPaymentText(page);
  if (PAYMENT_TEXT_PATTERN.test(finalText)) {
    throw new AmbetterPaymentDetailError(
      'parse_failed',
      'Ambetter payment detail loaded but required Current Amount and Paid Through fields were not parseable.'
    );
  }
  if (/Payments\/Invoices|Make a Payment|Enroll In AutoPay/i.test(finalText)) {
    throw new AmbetterPaymentDetailError(
      'no_current_invoice',
      'Ambetter payment page loaded but no current payment/invoice panel was available.'
    );
  }

  return null;
}

function getParseableRequiredPaymentDetail(text: string): AmbetterPaymentDetail | null {
  if (!REQUIRED_PAYMENT_TEXT_PATTERN.test(text)) return null;
  const detail = parseAmbetterPaymentDetailText(text);
  if (detail.payment_current_amount === null || !detail.paid_through_date_detail) return null;
  return detail;
}

function hasDelinquencyStatusLabel(text: string): boolean {
  return DELINQUENCY_STATUS_PATTERN.test(text);
}

export function parseRequiredAmbetterPaymentDetail(
  text: string,
  source: AmbetterPaymentDetailSource
): AmbetterPaymentDetail {
  const detail = parseAmbetterPaymentDetailText(text);
  if (detail.payment_current_amount === null || !detail.paid_through_date_detail) {
    const status = PAYMENT_TEXT_PATTERN.test(text) ? 'parse_failed' : 'no_current_invoice';
    throw new AmbetterPaymentDetailError(
      status,
      'Ambetter payment detail did not include parseable Current Amount and Paid Through fields.'
    );
  }

  return {
    ...detail,
    payment_detail_source: source,
  };
}

async function collectPaymentText(page: Page): Promise<string> {
  const parts = [await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '')];
  for (const frame of page.frames()) {
    parts.push(await frame.evaluate(() => document.body ? document.body.innerText : '').catch(() => ''));
  }
  return parts.join('\n');
}

function isSessionError(error: unknown): boolean {
  return error instanceof AmbetterPaymentDetailError && error.status === 'session_failed';
}

function normalizeAutopayStatus(value: string | null): AmbetterAutopayStatus {
  const normalized = value?.trim().toLowerCase() || '';
  if (normalized.includes('not')) return 'not_enrolled';
  if (normalized.includes('enrolled') || normalized === 'yes' || normalized === 'true' || normalized === 'on') {
    return 'enrolled';
  }
  return 'unknown';
}

function normalizeDelinquencyStatus(value: string | null): string | null {
  const normalized = value?.trim() || '';
  if (!normalized || normalized === '-') return null;
  return normalized;
}

export function extractLabeledValue(text: string, label: string): string | null {
  const lines = text.replace(/\u00a0/g, ' ').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelPattern = new RegExp(`^${label}\\s*:?\\s*(.*)$`, 'i');
  const nextLabelPattern = /^(Linkage Effective Date|Member Responsibility|State|Policy Term Date|Linkage Term Date|Prior APTC|Cancellation Reason|ICHRA Indicator|Payments\/Invoices|Current Amount|Paid Through|Last Payment Date|AutoPay|Navigation Mode|Type|Invoice Number|Payment Amount|Payment Date|Payment Method)/i;
  let sawBlankLabel = false;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(labelPattern);
    if (!match) continue;

    const sameLineValue = match[1]?.trim();
    if (sameLineValue) {
      if (nextLabelPattern.test(sameLineValue)) {
        sawBlankLabel = true;
        continue;
      }
      return extractCompactLabeledValue(lines[i], label) || sameLineValue;
    }

    const nextLine = lines[i + 1]?.trim();
    if (nextLine && !nextLabelPattern.test(nextLine)) {
      return nextLine;
    }
    sawBlankLabel = true;
  }

  return extractCompactLabeledValue(text, label) || (sawBlankLabel ? null : null);
}

function extractCompactLabeledValue(text: string, label: string): string | null {
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const followingLabels = [
    'Linkage Effective Date',
    'Member Responsibility',
    'State',
    'Policy Term Date',
    'Linkage Term Date',
    'Prior APTC',
    'Cancellation Reason',
    'ICHRA Indicator',
    'Payments/Invoices',
    'Current Amount',
    'Paid Through',
    'Last Payment Date',
    'AutoPay',
    'Navigation Mode',
    'Type',
    'Invoice Number',
    'Payment Amount',
    'Payment Date',
    'Payment Method',
    'Eligible For Commissions',
  ];

  const labelMatch = new RegExp(escapeRegExp(label), 'i').exec(normalized);
  if (!labelMatch) return null;

  const valueStart = labelMatch.index + labelMatch[0].length;
  const valueEnd = followingLabels.reduce((nearest, nextLabel) => {
    const nextMatch = new RegExp(escapeRegExp(nextLabel), 'i').exec(normalized.slice(valueStart));
    if (!nextMatch) return nearest;
    const nextIndex = valueStart + nextMatch.index;
    return Math.min(nearest, nextIndex);
  }, normalized.length);
  const value = normalized.slice(valueStart, valueEnd).replace(/^:/, '').trim();
  return value || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLastPaymentDate(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split('/');
  if (parts.length === 3 && parts[2].length === 2) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/20${parts[2]}`;
  }
  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown Ambetter payment enrichment error.');
}
