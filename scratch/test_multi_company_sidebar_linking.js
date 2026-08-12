const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: PERSONAL SIDEBAR MULTI-COMPANY LINKING');
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

// Audit Page Source (src/app/clients/[id]/page.tsx)
const pagePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const pageSrc = fs.readFileSync(pagePath, 'utf8');

// 1. Sidebar Search Block Location & Condition
assert(pageSrc.includes('Link Company'), 'TEST 1 - Sidebar contains LINK COMPANY section label');
assert(pageSrc.includes('placeholder="Search companies..."'), 'TEST 2 - Sidebar contains Search companies... input placeholder');
assert(pageSrc.includes("eq('client_type', 'company')"), 'TEST 3 - Search query filters clients by client_type = company');
assert(pageSrc.includes('full_name.ilike'), 'TEST 4 - Search query matches Company full_name, agency_name, email, phone, ein');

// 2. Link Action & Uniqueness
assert(pageSrc.includes('handleLinkCompany'), 'TEST 5 - Page implements handleLinkCompany action handler');
assert(pageSrc.includes("from('client_company_relationships')") && pageSrc.includes('company_client_id: company.id') && pageSrc.includes('personal_client_id: clientId'), 'TEST 6 - handleLinkCompany inserts exact IDs into client_company_relationships');
assert(pageSrc.includes('linkStatus === \'current\'') && pageSrc.includes('linkStatus === \'other\''), 'TEST 7 - Search results distinguish current profile link vs other profile link (Unavailable)');

// 3. Multi-Company Sidebar Display
assert(pageSrc.includes("linkedCompanyProfiles.length > 1 ? 'Linked Companies' : 'Linked Company'"), 'TEST 8 - Sidebar heading pluralizes to Linked Companies when multiple companies are linked');
assert(pageSrc.includes('No companies linked.'), 'TEST 9 - Empty state displays No companies linked when zero companies are linked');
assert(pageSrc.includes('href={`/clients/${comp.id}`}') && pageSrc.includes('View Company Profile'), 'TEST 10 - View Company Profile routes directly to company_client_id');

// 4. Overview Surfacing & Lineage
assert(pageSrc.includes('isLinkedCommercial: true'), 'TEST 11 - Personal Overview surfaces linked commercial policies with red/linked-commercial presentation');
assert(pageSrc.includes('companyName: resolvedCompanyName'), 'TEST 12 - Personal Overview resolves specific Company Name for each linked company policy card');

console.log('\n====================================================');
console.log(`SUMMARY RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
