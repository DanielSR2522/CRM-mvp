import type { Frame, Page } from 'playwright';

const AMBETTER_POLICY_FRAME_PATH = '/apex/BC_VFP02_PolicyList';
const POLICY_TABLE_SELECTOR = '#policiesTable, table.dataTable';
const LOGIN_TEXT_PATTERN = /sign in to your account|enter your password|forgot your password/i;

export interface AmbetterPoliciesReadinessOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AmbetterPoliciesReadinessDiagnostics {
  finalUrl: string;
  pageTitle: string;
  frameUrls: string[];
  loginTextVisible: boolean;
}

export async function waitForAmbetterPoliciesFrame(
  page: Page,
  options: AmbetterPoliciesReadinessOptions = {}
): Promise<Frame> {
  const timeoutMs = options.timeoutMs ?? 75000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const deadline = Date.now() + timeoutMs;
  let diagnostics = await collectAmbetterPoliciesDiagnostics(page);

  while (Date.now() < deadline) {
    diagnostics = await collectAmbetterPoliciesDiagnostics(page);
    const policyFrame = findAmbetterPolicyFrame(page.frames());

    if (policyFrame && await frameHasPolicyTable(policyFrame)) {
      return policyFrame;
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  diagnostics = await collectAmbetterPoliciesDiagnostics(page);
  const serializedDiagnostics = formatAmbetterReadinessDiagnostics(diagnostics);

  if (diagnostics.loginTextVisible || isAmbetterLoginUrl(diagnostics.finalUrl)) {
    throw new Error(`Ambetter portal session expired or stopped on login while loading policies. ${serializedDiagnostics}`);
  }

  throw new Error(`Ambetter policies page did not become ready before timeout. ${serializedDiagnostics}`);
}

export function findAmbetterPolicyFrame(frames: Frame[]): Frame | null {
  return frames.find((frame) => frame.url().includes(AMBETTER_POLICY_FRAME_PATH)) || null;
}

export async function collectAmbetterPoliciesDiagnostics(page: Page): Promise<AmbetterPoliciesReadinessDiagnostics> {
  const finalUrl = page.url();
  const pageTitle = await page.title().catch(() => 'Unavailable');
  const frameUrls = page.frames().map((frame) => sanitizeDiagnosticUrl(frame.url()));
  const loginTextVisible = await page.evaluate((loginPatternSource) => {
    const bodyText = document.body ? document.body.innerText : '';
    return new RegExp(loginPatternSource, 'i').test(bodyText);
  }, LOGIN_TEXT_PATTERN.source).catch(() => false);

  return {
    finalUrl: sanitizeDiagnosticUrl(finalUrl),
    pageTitle,
    frameUrls,
    loginTextVisible,
  };
}

export function formatAmbetterReadinessDiagnostics(diagnostics: AmbetterPoliciesReadinessDiagnostics): string {
  return [
    `finalUrl=${diagnostics.finalUrl}`,
    `pageTitle=${diagnostics.pageTitle}`,
    `loginTextVisible=${diagnostics.loginTextVisible}`,
    `frameUrls=[${diagnostics.frameUrls.join(', ')}]`,
  ].join(' ');
}

function isAmbetterLoginUrl(url: string): boolean {
  return /broker\.ambetterhealth\.com\/s\/login/i.test(url);
}

async function frameHasPolicyTable(frame: Frame): Promise<boolean> {
  return frame.locator(POLICY_TABLE_SELECTOR).first().count()
    .then((count) => count > 0)
    .catch(() => false);
}

function sanitizeDiagnosticUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawUrl.split('?')[0];
  }
}
