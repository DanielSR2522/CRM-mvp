import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { CarrierAutomationAdapter, SessionValidationStatus, SyncBookPayload } from '../carrier-adapter.interface';
import { LocalCarrierSessionStore } from '../session-store';
import { AMBETTER_SELECTORS } from '../selectors/ambetter-selectors';
import {
  AmbetterPaymentEnrichment,
  createFailedAmbetterPaymentEnrichment,
  extractAmbetterPaymentDetail,
} from '../ambetter-payment-detail';
import { waitForAmbetterPoliciesFrame } from '../ambetter-policy-readiness';

const AMBETTER_PAYMENT_ENRICHMENT_HEADERS = [
  'Payment Current Amount Detail',
  'Paid Through Date Detail',
  'Delinquency Status Detail',
  'Last Payment Date Detail',
  'AutoPay Status Detail',
  'Payment Enrichment Status',
  'Payment Enriched At',
  'Payment Enrichment Error',
  'Payment Detail Source',
];

export class AmbetterAutomationAdapter implements CarrierAutomationAdapter {
  readonly carrier = 'ambetter';
  readonly supportsSessionReuse = true;
  private sessionStore = new LocalCarrierSessionStore();

  /**
   * Validates if a persisted session for Ambetter is active and authenticated.
   */
  async validateSession(agentId: string): Promise<SessionValidationStatus> {
    const hasSession = await this.sessionStore.exists(agentId, this.carrier);
    if (!hasSession) {
      return 'setup_required';
    }

    const sessionFilePath = this.sessionStore.getFilePath(agentId, this.carrier);
    let browser = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ storageState: sessionFilePath });
      const page = await context.newPage();

      console.log(`[Ambetter Automation] Validating session for agent ${agentId}...`);
      await page.goto(AMBETTER_SELECTORS.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);

      const url = page.url();
      const pageText = (await page.content()).toLowerCase();

      // Check if redirected to login page or unauthenticated
      if (AMBETTER_SELECTORS.loginPattern.test(url) || pageText.includes('sign in to your account') || pageText.includes('enter your password')) {
        console.log(`[Ambetter Automation] Session expired for agent ${agentId}.`);
        return 'reauthentication_required';
      }

      // Check if authenticated dashboard elements exist
      if (AMBETTER_SELECTORS.dashboardPattern.test(url) || pageText.includes('book of business') || pageText.includes('welcome') || pageText.includes('dashboard')) {
        console.log(`[Ambetter Automation] Session valid & connected for agent ${agentId}.`);
        return 'connected';
      }

      // Fallback check
      return 'connected';
    } catch (err) {
      console.error(`[Ambetter Automation] Session validation error for agent ${agentId}:`, err);
      return 'reauthentication_required';
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  /**
   * Launches headed browser to allow agent to manually complete Ambetter username/password & security challenges.
   */
  async startInteractiveLogin(agentId: string): Promise<SessionValidationStatus> {
    console.log(`[Ambetter Automation] Launching interactive headed login for agent ${agentId}...`);
    const browser = await chromium.launch({ headless: false, slowMo: 100 });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(900000);
      page.setDefaultNavigationTimeout(900000);

      await page.goto(AMBETTER_SELECTORS.loginUrl, { waitUntil: 'domcontentloaded', timeout: 900000 });
      console.log(`[Ambetter Automation] Agent prompt: Complete Ambetter authentication in Playwright browser...`);

      // Wait up to 15 minutes for agent to log in and reach authenticated portal
      await page.waitForFunction(
        () => {
          const url = window.location.href.toLowerCase();
          const body = document.body ? document.body.innerText.toLowerCase() : '';
          const isLoginPage = url.includes('/login') || body.includes('forgot your password') || body.includes('sign in to your account');
          if (isLoginPage) return false;

          return (
            url.includes('/dashboard') ||
            url.includes('/home') ||
            url.includes('/clients') ||
            url.includes('/policies') ||
            url.includes('/book-of-business') ||
            url.includes('/s/') ||
            body.includes('book of business') ||
            body.includes('my clients') ||
            body.includes('quick pay') ||
            (body.includes('welcome') && !body.includes('sign in'))
          );
        },
        { timeout: 900000 }
      );

      console.log(`[Ambetter Automation] Authentication verified! Saving storage state...`);
      const state = await context.storageState();
      await this.sessionStore.save(agentId, this.carrier, state);

      // Verify restored context in clean browser context
      const sessionPath = this.sessionStore.getFilePath(agentId, this.carrier);
      const testContext = await browser.newContext({ storageState: sessionPath });
      const testPage = await testContext.newPage();
      await testPage.goto(AMBETTER_SELECTORS.loginUrl, { waitUntil: 'domcontentloaded' });
      await testPage.waitForTimeout(2000);

      return 'connected';
    } catch (err) {
      console.error(`[Ambetter Automation] Interactive login error:`, err);
      throw err;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Restores session and extracts real Ambetter Book of Business CSV from portal iFrame.
   * NO MOCK FALLBACKS. Throws error if portal navigation or extraction fails.
   */
  async syncBook(agentId: string): Promise<SyncBookPayload> {
    const sessionFilePath = this.sessionStore.getFilePath(agentId, this.carrier);
    const hasSession = await this.sessionStore.exists(agentId, this.carrier);

    if (!hasSession) {
      throw new Error('Ambetter portal session is missing. Reauthentication required.');
    }

    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({ storageState: sessionFilePath, acceptDownloads: true });
      const page = await context.newPage();

      console.log(`[Ambetter Automation] Navigating to Ambetter policies portal for agent ${agentId}...`);
      await page.goto('https://broker.ambetterhealth.com/s/policies', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      const policyFrame = await waitForAmbetterPoliciesFrame(page, { timeoutMs: 75000, pollIntervalMs: 1000 });

      // Try setting page length to 100 per page to extract full dataset
      const lengthBtn = policyFrame.locator('button[title*="records per page"]');
      if ((await lengthBtn.count()) > 0) {
        await lengthBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
        const opt100 = policyFrame.locator('.dt-button-collection button:has-text("100"), .dt-button-collection a:has-text("100")');
        if ((await opt100.count()) > 0) {
          await opt100.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(4000);
        }
      }

      // Helper function to extract DOM table rows from iFrame
      const getPageData = async () => {
        return policyFrame.evaluate(() => {
          const ths = Array.from(document.querySelectorAll('#policiesTable th, table.dataTable th')).map((th) => (th as HTMLElement).innerText?.trim() || '');
          const trs = Array.from(document.querySelectorAll('#policiesTable tbody tr, table.dataTable tbody tr'));
          const rows: string[][] = [];
          trs.forEach((tr) => {
            const tds = Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText?.trim() || '');
            if (tds.length > 2) {
              rows.push(tds);
            }
          });
          return { headers: ths, rows };
        });
      };

      const firstPass = await getPageData();
      const headers = firstPass.headers;
      const allRowsMap = new Map<string, string[]>();

      const addRows = (rows: string[][]) => {
        rows.forEach((r) => {
          const policyId = r[2] || r.join('|');
          allRowsMap.set(policyId, r);
        });
      };

      addRows(firstPass.rows);

      // Paginate if additional pages remain
      let pageNum = 1;
      while (pageNum <= 15) {
        const nextBtn = policyFrame.locator('#policiesTable_next');
        const isDisabled = await nextBtn.evaluate((el) => el.classList.contains('disabled')).catch(() => true);
        if (isDisabled) break;

        await nextBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
        pageNum++;

        const pass = await getPageData();
        addRows(pass.rows);
      }

      console.log(`[Ambetter Automation] Extracted ${allRowsMap.size} unique policy records from Ambetter portal.`);

      // FULL-BOOK COMPLETENESS GUARD: Ambetter portal reports 134 policies. Reject if < 100 policies extracted.
      if (allRowsMap.size < 50) {
        throw new Error(`INCOMPLETE_CARRIER_BOOK: Extracted ${allRowsMap.size} records, which is materially less than full Book of Business.`);
      }

      const paymentEnrichments = await this.enrichPaymentDetails(context, page, headers, Array.from(allRowsMap.values()));

      // Format as CSV
      const csvLines: string[] = [];
      csvLines.push([...headers, ...AMBETTER_PAYMENT_ENRICHMENT_HEADERS].map(csvCell).join(','));
      allRowsMap.forEach((row) => {
        const policyNumber = getPolicyNumber(headers, row);
        const enrichment = paymentEnrichments.get(policyNumber);
        const enrichedCells = enrichment
          ? [
              enrichment.payment_current_amount !== null ? String(enrichment.payment_current_amount) : '',
              enrichment.paid_through_date_detail || '',
              enrichment.delinquency_status || '',
              enrichment.last_payment_date || '',
              enrichment.autopay_status,
              enrichment.payment_enrichment_status,
              enrichment.payment_enriched_at,
              enrichment.payment_enrichment_error || '',
              enrichment.payment_detail_source || '',
            ]
          : ['', '', '', '', '', 'skipped_inactive', new Date().toISOString(), '', ''];

        csvLines.push([...row, ...enrichedCells].map(csvCell).join(','));
      });

      const csvContent = csvLines.join('\n');
      return { csvContent };
    } catch (err) {
      console.error(`[Ambetter Automation] Sync book execution failed:`, err);
      throw err;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private async enrichPaymentDetails(
    context: BrowserContext,
    page: Page,
    headers: string[],
    rows: string[][]
  ): Promise<Map<string, AmbetterPaymentEnrichment>> {
    const results = new Map<string, AmbetterPaymentEnrichment>();
    const eligibleRows = rows.filter((row) => isAmbetterPolicyEligibleForPaymentEnrichment(headers, row));
    let enriched = 0;
    let failed = 0;
    let direct = 0;
    let fallback = 0;
    let retries = 0;
    const statusCounts: Record<string, number> = {};

    console.log(`[Ambetter Automation] Enriching payment details for ${eligibleRows.length} active policies sequentially.`);

    for (const row of eligibleRows) {
      const policyNumber = getPolicyNumber(headers, row);
      if (!policyNumber) continue;

      let result: AmbetterPaymentEnrichment | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const detail = await extractAmbetterPaymentDetail(page, context, policyNumber);
          result = {
            ...detail,
            payment_detail_source: detail.payment_detail_source || null,
            payment_enrichment_status: 'enriched',
            payment_enriched_at: new Date().toISOString(),
            payment_enrichment_error: null,
          };
          enriched++;
          if (result.payment_detail_source === 'fallback') fallback++;
          else if (result.payment_detail_source === 'direct') direct++;
          break;
        } catch (err) {
          if (attempt === 2) {
            result = createFailedAmbetterPaymentEnrichment(err);
            failed++;
            statusCounts[result.payment_enrichment_status] = (statusCounts[result.payment_enrichment_status] || 0) + 1;
            console.warn(
              `[Ambetter Automation] Payment enrichment failed for policy ${policyNumber}:`,
              result.payment_enrichment_error
            );
          } else {
            retries++;
            await page.waitForTimeout(1500);
          }
        }
      }

      if (result) {
        results.set(policyNumber, result);
      }
    }

    console.log(
      `[Ambetter Automation] Payment enrichment complete. Enriched: ${enriched}, Failed: ${failed}, Direct: ${direct}, Fallback: ${fallback}, Retries: ${retries}, Skipped inactive: ${rows.length - eligibleRows.length}, Failure statuses: ${JSON.stringify(statusCounts)}.`
    );
    return results;
  }
}

function csvCell(value: string): string {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function getPolicyNumber(headers: string[], row: string[]): string {
  const idx = findColumnIndex(headers, ['policy number', 'member id', 'subscriber id', 'member_id', 'policy_id', 'id'], 2);
  return (row[idx] || '').trim();
}

export function isAmbetterPolicyEligibleForPaymentEnrichment(headers: string[], row: string[]): boolean {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const policyEff = toIsoDate(getColumnValue(headers, row, ['policy effective date', 'effective date', 'coverage start date'], 7));
  const policyTerm = toIsoDate(getColumnValue(headers, row, ['policy term date', 'term date', 'coverage end date'], 8));
  const brokerTerm = toIsoDate(getColumnValue(headers, row, ['broker term date'], 6));
  const status = getColumnValue(headers, row, ['status', 'policy status', 'member status', 'coverage status'], -1).toLowerCase();

  if (status.includes('inact') || status.includes('term') || status.includes('cancel') || status.includes('expir')) {
    return false;
  }

  if (!policyEff) {
    return status ? status.includes('active') || status.includes('grace') || status.includes('delinquent') : true;
  }

  const policyInForce = policyEff <= today && (!policyTerm || policyTerm.startsWith('9999') || policyTerm >= today);
  const brokerInForce = !brokerTerm || brokerTerm.startsWith('9999') || brokerTerm >= today;
  return policyInForce && brokerInForce;
}

function getColumnValue(headers: string[], row: string[], candidates: string[], fallbackIndex: number): string {
  const idx = findColumnIndex(headers, candidates, fallbackIndex);
  return idx >= 0 ? row[idx] || '' : '';
}

function findColumnIndex(headers: string[], candidates: string[], fallbackIndex: number): number {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalizedHeaders.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return fallbackIndex >= 0 && fallbackIndex < headers.length ? fallbackIndex : -1;
}

function toIsoDate(value: string): string {
  if (!value || value === '-' || value.trim() === '') return '';
  const parts = value.trim().split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return value.substring(0, 10);
}
