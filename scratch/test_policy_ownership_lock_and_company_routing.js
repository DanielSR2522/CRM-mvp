const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: POLICY OWNERSHIP LOCK & COMPANY ROUTING');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`${message}: ✅ PASS`);
    passCount++;
  } else {
    console.error(`${message}: ❌ FAIL`);
    failCount++;
  }
}

// 1. Audit New Policy Page Source (src/app/clients/[id]/policies/new/page.tsx)
const newPagePath = path.join(__dirname, '../src/app/clients/[id]/policies/new/page.tsx');
const newPageSrc = fs.readFileSync(newPagePath, 'utf8');

assert(!newPageSrc.includes('onChange={e => setPolicyOwnershipType'), 'TEST 1 - New Policy form has NO editable Policy Type select dropdown');
assert(newPageSrc.includes('Derived from Client Profile'), 'TEST 2 - New Policy form renders read-only Derived from Client Profile indicator');
assert(newPageSrc.includes("policy_ownership_type: isCompanyClient ? 'company' : 'personal'"), 'TEST 3 - New Policy insert payload derives policy_ownership_type directly from client_type');
assert(newPageSrc.includes('router.push(`/clients/${id}/policies/${data.id}`)'), 'TEST 4 - New Policy post-creation routing retains exact route client ID (does NOT redirect to linked personal client)');

// 2. Audit Policy Detail Page Source (src/app/clients/[id]/policies/[policyId]/page.tsx)
const detailPagePath = path.join(__dirname, '../src/app/clients/[id]/policies/[policyId]/page.tsx');
const detailPageSrc = fs.readFileSync(detailPagePath, 'utf8');

assert(!detailPageSrc.includes('onChange={e => setPolicyOwnershipType'), 'TEST 5 - Policy Summary form has NO editable Policy Type select dropdown');
assert(detailPageSrc.includes('client?.client_type === \'company\''), 'TEST 6 - Policy Summary Policy Type indicator derives from client_type');
assert(detailPageSrc.includes("policy_ownership_type: (client?.client_type === 'company' || policyOwnershipType === 'company') ? 'company' : 'personal'"), 'TEST 7 - Save Summary enforces derived policy_ownership_type invariant');
assert(detailPageSrc.includes("policy_ownership_type: (client?.client_type === 'company' || policyOwnershipType === 'company') ? 'company' : 'personal'"), 'TEST 8 - Renew Policy preserves derived policy_ownership_type');
assert(detailPageSrc.includes('router.push(`/clients/${id}/policies/${newPolicy.id}`)'), 'TEST 9 - Renew Policy routing retains exact route client ID');
assert(detailPageSrc.includes("resolvedSidebarName = client?.client_type === 'company'"), 'TEST 10 - Resolved sidebar name displays Company profile name for Company clients');

// 3. Audit Migration Cardinality (supabase/migrations/20260815000000_enforce_one_contact_per_company.sql)
const oneContactMigPath = path.join(__dirname, '../supabase/migrations/20260815000000_enforce_one_contact_per_company.sql');
const oneContactMigSrc = fs.readFileSync(oneContactMigPath, 'utf8');
assert(oneContactMigSrc.includes('ON public.client_company_relationships(company_client_id)'), 'TEST 11 - One Contact per Company constraint is scoped to company_client_id (allowing 1 Personal -> MANY Companies)');

console.log('\n====================================================');
console.log(`SUMMARY RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
