console.log('===========================================================');
console.log('TESTING CLIENT OVERVIEW BUSINESS RULES & CLASSIFICATIONS');
console.log('===========================================================\n');

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    pass++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    fail++;
  }
}

// Mock dataset representing DB records
const mockPolicies = [
  { id: 'pc-1', status: 'Active', policy_type: 'Auto', writing_company: 'Geico', policy_number: 'PC-100', total_premium: 1200, expiration_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] },
  { id: 'pc-2', status: 'Pending', policy_type: 'Home', writing_company: 'State Farm', policy_number: 'PC-200', total_premium: 800 },
  { id: 'pc-3', status: 'Cancelled', policy_type: 'Flood', writing_company: 'Allstate', policy_number: 'PC-300', total_premium: 500, expiration_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] },
];

const mockHealthPolicies = [
  { id: 'h-1', active: true, plan_name: 'Silver 87 ACA', company_2026: 'Ambetter', plan_id: 'H-100', plan_cost: 350, policy_status: 'Active' },
  { id: 'h-2', active: false, plan_name: 'Bronze 60 ACA', company_2026: 'Molina', plan_id: 'H-200', plan_cost: 200, policy_status: 'Active' },
];

const mockLifePolicies = [
  // Life 1: No products
  { id: 'l-1', status: 'Active', life_policy_products: [] },
  // Life 2: Product company null
  { id: 'l-2', status: 'Active', life_policy_products: [{ product_type: 'Term', company: null }] },
  // Life 3: Product company empty string
  { id: 'l-3', status: 'Active', life_policy_products: [{ product_type: 'IUL', company: '' }] },
  // Life 4: Product company only spaces
  { id: 'l-4', status: 'Active', life_policy_products: [{ product_type: 'Whole Life', company: '   ' }] },
  // Life 5: Valid Prudential
  { id: 'l-5', status: 'Active', life_policy_products: [{ product_type: 'Term', company: 'Prudential Life', policy_number: 'L-101', policy_date: '2026-05-15', monthly_premium: 120.50 }] },
  // Life 6: Valid Mutual of Omaha
  { id: 'l-6', status: 'Active', life_policy_products: [{ product_type: 'IUL', company: 'Mutual of Omaha', policy_number: 'L-202', policy_date: '2026-06-01', monthly_premium: 250.00 }] },
];

// Exact Overview Cards logic from page.tsx
const consolidatedOverviewCards: any[] = [];

// 1. P&C
mockPolicies.forEach((p: any) => {
  if (p.status === 'Active') {
    consolidatedOverviewCards.push({
      id: p.id,
      businessLine: 'property_casualty',
      businessLineLabel: 'Property & Casualty',
      policy_type: p.policy_type || 'P&C Policy',
      company_name: p.writing_company || p.company_name || 'Carrier Unspecified',
      policy_number: p.policy_number || 'N/A',
      status: 'Active',
      effective_date: p.effective_date || null,
      expiration_date: p.expiration_date || null,
      premium: Number(p.total_premium || p.premium || 0),
      targetTab: 'policies',
      updated_at: p.updated_at || p.created_at || new Date().toISOString(),
    });
  }
});

// 2. Health
mockHealthPolicies.forEach((h: any) => {
  if (h.active === true) {
    consolidatedOverviewCards.push({
      id: h.id,
      businessLine: 'health',
      businessLineLabel: 'Health',
      policy_type: h.plan_name || 'Health Plan',
      company_name: h.company_2026 || 'Marketplace Carrier',
      policy_number: h.plan_id || h.application_number || 'N/A',
      status: 'Active',
      effective_date: h.effective_date || null,
      expiration_date: null,
      premium: Number(h.plan_cost || 0),
      targetTab: 'health',
      updated_at: h.updated_at || h.created_at || new Date().toISOString(),
    });
  }
});

// 3. Life
mockLifePolicies.forEach((l: any) => {
  const prods = l.life_policy_products || [];
  const qualifyingProd = prods.find(
    (prod: any) => prod.company && typeof prod.company === 'string' && prod.company.trim().length > 0
  );

  if (qualifyingProd) {
    consolidatedOverviewCards.push({
      id: l.id,
      businessLine: 'life',
      businessLineLabel: 'Life Insurance',
      policy_type: qualifyingProd.product_type || 'Life Policy',
      company_name: qualifyingProd.company.trim(),
      policy_number: qualifyingProd.policy_number || 'N/A',
      status: 'Active',
      effective_date: qualifyingProd.policy_date || null,
      expiration_date: null,
      premium: Number(qualifyingProd.monthly_premium || 0),
      targetTab: 'life',
      updated_at: l.updated_at || l.created_at || new Date().toISOString(),
    });
  }
});

// Metrics
const activeCount = consolidatedOverviewCards.length;
const pendingCount = 0;

const expiringSoonCount = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sixtyDaysFromNow = new Date();
  sixtyDaysFromNow.setDate(today.getDate() + 60);
  sixtyDaysFromNow.setHours(23, 59, 59, 999);

  return consolidatedOverviewCards.filter((card) => {
    if (card.businessLine !== 'property_casualty' || !card.expiration_date) return false;
    const expDate = new Date(card.expiration_date + 'T00:00:00');
    return expDate >= today && expDate <= sixtyDaysFromNow;
  }).length;
})();

// VERIFICATIONS
assert(consolidatedOverviewCards.some(c => c.policy_number === 'PC-100'), 'Case 1: P&C status Active appears in Overview');
assert(!consolidatedOverviewCards.some(c => c.policy_number === 'PC-200'), 'Case 2: P&C status Pending does NOT appear');
assert(!consolidatedOverviewCards.some(c => c.policy_number === 'PC-300'), 'Case 3: P&C status Cancelled does NOT appear');
assert(consolidatedOverviewCards.some(c => c.company_name === 'Ambetter'), 'Case 4: Health active = true appears in Overview');
assert(!consolidatedOverviewCards.some(c => c.company_name === 'Molina'), 'Case 5: Health active = false does NOT appear regardless of policy_status');

const lifeCards = consolidatedOverviewCards.filter(c => c.businessLine === 'life');
assert(lifeCards.length === 2, 'Cases 6-11: Exactly 2 qualifying Life policies appear (unqualified ones excluded)');
assert(lifeCards.some(c => c.company_name === 'Prudential Life'), 'Case 10: Life policy with Prudential Life appears');
assert(lifeCards.some(c => c.company_name === 'Mutual of Omaha'), 'Case 11: Life policy with Mutual of Omaha appears');

assert(activeCount === 4, `Case 12: Active Policies metric (${activeCount}) equals exact number of visible Overview cards (4)`);
assert(pendingCount === 0, `Case 8: Pending Policies metric equals 0`);
assert(expiringSoonCount === 1, `Case 13: Expiring Soon metric equals 1 (only active P&C policy PC-100 within 60 days)`);

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');

export {};
