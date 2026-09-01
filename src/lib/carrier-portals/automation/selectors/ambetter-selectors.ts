/**
 * Ambetter Broker Portal Selectors & Constants.
 * Centralizes URLs, semantic button labels, and input selectors for Ambetter automation.
 */

export const AMBETTER_SELECTORS = {
  // URLs
  loginUrl: 'https://broker.ambetterhealth.com/',
  dashboardPattern: /broker.*ambetterhealth\.com\/(dashboard|home|clients|policies|book-of-business)/i,
  loginPattern: /broker.*ambetterhealth\.com\/(login|signin|auth)/i,

  // Login inputs & buttons
  usernameInput: 'input[name="username"], input[name="email"], input[id*="username"], input[type="email"]',
  passwordInput: 'input[name="password"], input[type="password"]',
  submitButton: 'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',

  // Book of Business & Export selectors
  bookOfBusinessTab: 'a:has-text("Book of Business"), button:has-text("Book of Business"), a:has-text("Clients"), a:has-text("Policies")',
  exportCsvButton: 'button:has-text("Export"), a:has-text("Export"), button:has-text("Download"), a:has-text("Download CSV")',

  // Dashboard verification indicators
  dashboardIndicator: 'text="Book of Business", text="My Clients", text="Welcome", nav, header',
};
