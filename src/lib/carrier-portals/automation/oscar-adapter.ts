import fs from 'fs';
import path from 'path';
import { chromium, Browser, BrowserContext } from 'playwright';
import { SupabaseClient } from '@supabase/supabase-js';
import { OSCAR_URLS, OSCAR_SELECTORS } from './oscar-selectors';
import { SessionValidationStatus, AutomatedSyncResult } from './types';
import { executeCarrierSync } from '../sync-service';
import { parseOscarCsv } from '../oscar-csv-parser';

export function getSessionFilePath(agentId: string): string {
  const dir = path.resolve(process.cwd(), '.carrier-sessions', agentId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'oscar.json');
}

export function getOscarProfileDir(agentId: string): string {
  const dir = path.resolve(process.cwd(), '.carrier-profiles', agentId, 'oscar');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDownloadDir(agentId: string): string {
  const dir = path.resolve(process.cwd(), '.carrier-downloads', agentId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const COMMON_OSCAR_BROWSER_CONFIG = {
  headless: false,
  viewport: null,
  args: ['--start-maximized'],
  acceptDownloads: true,
};

/**
 * 1. Interactive Headed Oscar Login Flow (RECONNECT ONLY).
 * Agent completes credentials & MFA inside persistent Chromium context.
 * Canonical Timeout: 15 minutes (900,000 ms).
 */
export async function startInteractiveLogin(agentId: string, maxWaitMs = 900000) {
  const profileDir = getOscarProfileDir(agentId);
  console.log(`[Oscar Automation] Starting interactive headed login for Agent: ${agentId}`);
  console.log(`[Oscar Automation] Absolute Profile Directory: ${profileDir}`);

  const context = await chromium.launchPersistentContext(profileDir, COMMON_OSCAR_BROWSER_CONFIG);
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(OSCAR_URLS.login, { waitUntil: 'domcontentloaded' });
    console.log('[Oscar Automation] Navigated to Oscar login. Waiting up to 15 minutes for agent manual authentication & MFA...');

    const startTime = Date.now();
    let isAuthenticated = false;

    // Poll up to 15 minutes (900,000 ms) until authenticated
    while (Date.now() - startTime < maxWaitMs) {
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 1500 }).catch(() => {});

        const currentUrl = page.url();
        const isLoginOrMfa =
          currentUrl.includes('/login') ||
          currentUrl.includes('/mfa') ||
          currentUrl.includes('/auth') ||
          currentUrl.includes('/signin') ||
          currentUrl.includes('/sso');

        if (!isLoginOrMfa) {
          const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
          const is404 = bodyText.includes('Page Not Found') || bodyText.includes('404');

          if (!is404) {
            let foundAuthSignal = false;

            for (const selector of OSCAR_SELECTORS.authenticatedIndicators) {
              const count = await page.locator(selector).count().catch(() => 0);
              if (count > 0) {
                const isVis = await page.locator(selector).first().isVisible().catch(() => false);
                if (isVis) {
                  foundAuthSignal = true;
                  break;
                }
              }
            }

            if (
              foundAuthSignal ||
              ((currentUrl.includes('/brokers') || currentUrl.includes('/dashboard') || currentUrl.includes('/book') || currentUrl.includes('/account')) && !currentUrl.includes('/login'))
            ) {
              console.log(`[Oscar Automation] Authenticated signal detected on URL: ${currentUrl}`);
              isAuthenticated = true;
              break;
            }
          }
        }
      } catch (loopErr: any) {
        console.log('[Oscar Automation] Navigation in progress, retrying authentication check...');
      }

      if (isAuthenticated) break;
      await new Promise((res) => setTimeout(res, 2000));
    }

    if (!isAuthenticated) {
      throw new Error('Interactive login timed out after 15 minutes before manual authentication was completed.');
    }

    await page.waitForTimeout(3000);

    // SAME-CONTEXT VALIDATION before closing
    console.log('[Oscar Automation] Performing SAME-CONTEXT VALIDATION before closing context...');
    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
    const isLoginStill = finalUrl.includes('/login') || finalUrl.includes('/signin');

    if (isLoginStill || bodyText.includes('Page Not Found')) {
      throw new Error('Same-context validation failed: context remained unauthenticated.');
    }

    console.log(`[Oscar Automation] Same-context validation PASSED! Authenticated URL: ${finalUrl}`);
    return { success: true, profileDir, authenticatedUrl: finalUrl };
  } catch (err: any) {
    console.error('[Oscar Automation] Interactive login error:', err?.message || err);
    throw err;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * 2. Validate Session via Persistent Profile.
 */
export async function validateSession(agentId: string): Promise<SessionValidationStatus> {
  const profileDir = getOscarProfileDir(agentId);
  console.log(`[Oscar Automation] Validating session state via persistent profile...`);
  console.log(`[Oscar Automation] Absolute Profile Directory: ${profileDir}`);

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, COMMON_OSCAR_BROWSER_CONFIG);
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    await page.goto(OSCAR_URLS.portalDashboard, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '');

    if (finalUrl.includes('/login') || finalUrl.includes('/signin')) {
      console.log('[Oscar Automation] Session redirected to login URL.');
      return 'reauthentication_required';
    }

    let foundAuth = false;
    for (const selector of OSCAR_SELECTORS.authenticatedIndicators) {
      const count = await page.locator(selector).count().catch(() => 0);
      if (count > 0) {
        foundAuth = true;
        break;
      }
    }

    if (foundAuth || ((finalUrl.includes('/brokers') || finalUrl.includes('/dashboard') || finalUrl.includes('/book') || finalUrl.includes('/account')) && !finalUrl.includes('/login'))) {
      console.log('[Oscar Automation] Persistent profile session is valid and active!');
      return 'connected';
    }

    return 'reauthentication_required';
  } catch (err: any) {
    console.error('[Oscar Automation] Session validation error:', err?.message || err);
    return 'reauthentication_required';
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * 3. Download Oscar Individual Book CSV using restored persistent profile.
 */
export async function downloadBookCsv(agentId: string): Promise<{ downloadPath: string; portalPolicyCount: number; downloadedCsvRowCount: number }> {
  const profileDir = getOscarProfileDir(agentId);
  const downloadDir = getDownloadDir(agentId);

  console.log(`[Oscar Automation] Downloading Individual Book CSV using persistent profile...`);
  console.log(`[Oscar Automation] Absolute Profile Directory: ${profileDir}`);

  const context = await chromium.launchPersistentContext(profileDir, COMMON_OSCAR_BROWSER_CONFIG);

  try {
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('[Oscar Automation] Step 1: Navigating to Oscar Individual Book page...');
    await page.goto(OSCAR_URLS.individualBook, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const startUrl = page.url();
    if (startUrl.includes('/login') || startUrl.includes('/signin')) {
      // Fallback attempt to broker landing page
      await page.goto(OSCAR_URLS.portalDashboard, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      if (page.url().includes('/login') || page.url().includes('/signin')) {
        throw new Error('Oscar session expired. Reauthentication required.');
      }
    }

    console.log(`[Oscar Automation] Authenticated starting URL: ${page.url()}`);

    console.log('[Oscar Automation] Step 2: Navigating to Individual book view...');
    const indBookLocator = page
      .getByRole('link', { name: /individual book/i })
      .or(page.getByRole('button', { name: /individual book/i }))
      .or(page.locator('a:has-text("Individual book"), a:has-text("Individual Book")'))
      .or(page.locator('text=/individual book/i'));

    const count = await indBookLocator.count();
    if (count > 0) {
      console.log('[Oscar Automation] Clicking "Individual book" navigation...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        indBookLocator.first().click(),
      ]);
      await page.waitForTimeout(3000);
    } else {
      console.log('[Oscar Automation] Navigating directly to /brokers/book...');
      await page.goto(OSCAR_URLS.individualBook, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    const finalUrl = page.url();
    console.log(`[Oscar Automation] Final Individual Book page URL: ${finalUrl}`);

    const bodyText = await page.evaluate(() => document.body.innerText || '');
    if (finalUrl.includes('/login') || bodyText.includes('Page Not Found')) {
      throw new Error('Oscar session expired or Individual Book page not found. Reauthentication required.');
    }

    let portalPolicyCount = 0;
    const matchCount = bodyText.match(/(\d+)\s*(policies|members|clients)\s*found/i) ||
                       bodyText.match(/Showing\s*\d+-?(\d+)?\s*of\s*(\d+)/i) ||
                       bodyText.match(/(\d+)\s*Total\s*Policies/i);

    if (matchCount) {
      portalPolicyCount = parseInt(matchCount[1] || matchCount[2] || '0', 10);
      console.log(`[Oscar Automation] Portal reported policy count: ${portalPolicyCount}`);
    }

    // Step 4: Locate Export CSV button
    let exportLocator = page.locator('button:has-text("Export CSV"), a:has-text("Export CSV")');
    let isVisible = await exportLocator.count().then(c => c > 0).catch(() => false);

    if (!isVisible) {
      exportLocator = page.getByRole('button', { name: /^export csv$/i })
        .or(page.getByRole('button', { name: /export/i }))
        .or(page.getByRole('link', { name: /export csv/i }));
      isVisible = await exportLocator.count().then(c => c > 0).catch(() => false);
    }

    if (!isVisible) {
      throw new Error('Export CSV button not found on Oscar Individual Book page.');
    }

    console.log('[Oscar Automation] Triggering Export CSV download...');
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find(b => (b as HTMLElement).innerText?.trim() === 'Export CSV');
      if (btn) (btn as HTMLElement).click();
    });
    const download = await downloadPromise;

    const timestamp = Date.now();
    const downloadPath = path.join(downloadDir, `oscar-export-${timestamp}.csv`);
    await download.saveAs(downloadPath);

    const csvContent = fs.readFileSync(downloadPath, 'utf8');
    const csvLines = csvContent.trim().split('\n').filter((l) => l.trim().length > 0);
    const downloadedCsvRowCount = Math.max(0, csvLines.length - 1);

    console.log(`[Oscar Automation] CSV downloaded successfully: ${downloadPath} (${downloadedCsvRowCount} rows)`);

    return { downloadPath, portalPolicyCount, downloadedCsvRowCount };
  } catch (err: any) {
    console.error('[Oscar Automation] CSV download error:', err);
    throw err;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * 4. Run End-to-End Automated Portal Sync.
 * Validates session, downloads CSV, passes to Phase 1 importer with source: 'automated_portal'.
 */
export async function runAutomatedSync(
  agentId: string,
  supabase: SupabaseClient
): Promise<AutomatedSyncResult> {
  console.log(`[Oscar Automation] Initiating Automated Portal Sync for Agent: ${agentId}`);

  // 1. Validate Session
  const sessionStatus = await validateSession(agentId);

  // Update connection table status if reauth required
  if (sessionStatus !== 'connected') {
    const nowIso = new Date().toISOString();
    await supabase
      .from('carrier_connections')
      .update({
        connection_status: 'reauthentication_required',
        last_error: 'Oscar session expired. Reauthentication required.',
        updated_at: nowIso,
      })
      .eq('agent_id', agentId)
      .eq('carrier', 'oscar');

    return {
      success: false,
      sessionStatus: 'reauthentication_required',
      error: 'Oscar session expired. Reauthentication required via Connect Oscar (Local Test).',
    };
  }

  let downloadedFilePath: string | null = null;
  try {
    // 2. Download CSV via Playwright
    const downloadRes = await downloadBookCsv(agentId);
    downloadedFilePath = downloadRes.downloadPath;
    const csvContent = fs.readFileSync(downloadedFilePath, 'utf8');

    if (!csvContent || !csvContent.trim()) {
      throw new Error('Downloaded Oscar CSV is empty.');
    }

    // Check completeness gate
    const parsedRecords = parseOscarCsv(csvContent);
    const parserAcceptedCount = parsedRecords.records.length;

    if (downloadRes.portalPolicyCount > 0 && downloadRes.downloadedCsvRowCount !== downloadRes.portalPolicyCount) {
      throw new Error(`INCOMPLETE_CARRIER_BOOK: Portal reported ${downloadRes.portalPolicyCount} policies, but downloaded CSV contains ${downloadRes.downloadedCsvRowCount} rows.`);
    }

    if (downloadRes.downloadedCsvRowCount !== parserAcceptedCount) {
      throw new Error(`INCOMPLETE_CARRIER_BOOK: Downloaded CSV contains ${downloadRes.downloadedCsvRowCount} rows, but parser accepted ${parserAcceptedCount} rows.`);
    }

    // 3. Feed CSV into Phase 1 Canonical Importer with source: 'automated_portal'
    const syncResult = await executeCarrierSync({
      supabase,
      agentId,
      carrier: 'oscar',
      source: 'automated_portal',
      csvContent,
    });

    console.log('[Oscar Automation] Automated Portal Sync completed successfully!', syncResult);

    return {
      success: true,
      sessionStatus: 'connected',
      syncRunId: syncResult.syncRunId,
      recordsFound: syncResult.recordsFound,
      matchedCount: syncResult.matchedCount,
      reviewCount: syncResult.reviewCount,
      unmatchedCount: syncResult.unmatchedCount,
      changedCount: syncResult.changedCount,
    };
  } catch (err: any) {
    console.error('[Oscar Automation] Automated portal sync error:', err);

    // Record failed sync run if needed, preserve previous successful data
    const failedIso = new Date().toISOString();
    await supabase
      .from('carrier_connections')
      .update({
        last_sync_at: failedIso,
        last_error: err?.message || 'Automated portal sync error',
        updated_at: failedIso,
      })
      .eq('agent_id', agentId)
      .eq('carrier', 'oscar');

    return {
      success: false,
      sessionStatus: 'connected', // session was valid, but sync/download failed
      error: err?.message || 'Failed to complete automated portal sync.',
    };
  } finally {
    // Clean up temporary download file
    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
      try {
        fs.unlinkSync(downloadedFilePath);
        console.log(`[Oscar Automation] Temporary CSV file ${downloadedFilePath} deleted.`);
      } catch (e) {}
    }
  }
}
