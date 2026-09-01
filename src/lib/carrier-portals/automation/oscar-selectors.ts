/**
 * Centralized, stable semantic Playwright selectors for Oscar Health Broker Portal.
 */
export const OSCAR_URLS = {
  login: 'https://business.hioscar.com/login',
  brokerLanding: 'https://www.hioscar.com/brokers',
  portalDashboard: 'https://business.hioscar.com/dashboard/enrolled',
  individualBook: 'https://business.hioscar.com/book/ivl',
};

export const OSCAR_SELECTORS = {
  // Login Page Indicators
  emailInput: 'input[name="email"], input[type="email"], #email',
  passwordInput: 'input[name="password"], input[type="password"], #password',
  loginSubmitButton: 'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")',

  // Authenticated Portal Indicators
  authenticatedIndicators: [
    'a[href*="/brokers/book"]',
    'a[href*="/brokers/dashboard"]',
    'a[href*="/brokers/clients"]',
    'button:has-text("Sign out")',
    'button:has-text("Log out")',
    '[data-testid="user-profile-menu"]',
    'text=Individual Book',
    'text=My Book',
    'text=Oscar for Business',
  ],

  // Individual Book Page Selectors
  bookPageIndicators: [
    'text=Individual Book',
    'text=Member Book',
    'text=Active Policies',
    'button:has-text("Export")',
    'button:has-text("Export CSV")',
  ],

  // Export CSV Button Selectors (prioritized list)
  exportCsvButton: [
    'button:has-text("Export CSV")',
    'a:has-text("Export CSV")',
    'button:has-text("Export")',
    'a:has-text("Export")',
    'button:has-text("Download CSV")',
    '[data-testid="export-csv-button"]',
  ],
};
