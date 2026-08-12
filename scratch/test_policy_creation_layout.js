const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: NEW P&C POLICY CREATION LAYOUT ALIGNMENT');
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

// Audit New Policy Page Source
const newPagePath = path.join(__dirname, '../src/app/clients/[id]/policies/new/page.tsx');
const newPageSrc = fs.readFileSync(newPagePath, 'utf8');

// 1. Desktop 2-Column Grid Class
assert(newPageSrc.includes('grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm'), 'TEST 1 - New Policy form uses equal 2-column grid container (grid-cols-1 lg:grid-cols-2)');

// 2. Field Labels & Ordering
assert(newPageSrc.includes('Line of Business'), 'TEST 2 - Left Column contains Line of Business');
assert(newPageSrc.includes('Company'), 'TEST 3 - Left Column contains Company');
assert(newPageSrc.includes('Policy Number'), 'TEST 4 - Left Column contains Policy Number');
assert(newPageSrc.includes('Effective Date'), 'TEST 5 - Left Column contains Effective Date');
assert(newPageSrc.includes('Expiration Date'), 'TEST 6 - Left Column contains Expiration Date');
assert(newPageSrc.includes('Policy Address'), 'TEST 7 - Left Column contains Policy Address');

assert(newPageSrc.includes('Policy Type'), 'TEST 8 - Right Column contains Policy Type');
assert(newPageSrc.includes('Policy Status'), 'TEST 9 - Right Column contains Policy Status');
assert(newPageSrc.includes('Total Premium'), 'TEST 10 - Right Column contains Total Premium');
assert(newPageSrc.includes('Policy Payment Frequency'), 'TEST 11 - Right Column contains Policy Payment Frequency');
assert(newPageSrc.includes('Billing Type'), 'TEST 12 - Right Column contains Billing Type');
assert(newPageSrc.includes('Broker Name'), 'TEST 13 - Right Column contains Broker Name');

// 3. Omitted Visible Fields
assert(!newPageSrc.includes('label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Transaction Type'), 'TEST 14 - Transaction Type is omitted from visible UI');
assert(!newPageSrc.includes('label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Annual Premium'), 'TEST 15 - Annual Premium is omitted from visible UI');

// 4. Default Policy Type Logic based on clients.client_type
assert(newPageSrc.includes("const isCompany = clientData?.client_type === 'company';"), 'TEST 16 - Resolves isCompany directly from clients.client_type');
assert(newPageSrc.includes("setPolicyOwnershipType(isCompany ? 'company' : 'personal');"), 'TEST 17 - Defaults Policy Type to company for Company clients and personal for Personal clients');

// 5. Payload Persistence & Backward Compatibility
assert(newPageSrc.includes("transaction_type: 'New'"), 'TEST 18 - Insert payload sets transaction_type to New internally');
assert(newPageSrc.includes('annual_premium: premiumNum'), 'TEST 19 - Insert payload sets annual_premium synced with total_premium');
assert(newPageSrc.includes("policy_ownership_type: isCompanyClient ? 'company' : 'personal'"), 'TEST 20 - Insert payload derives policy_ownership_type directly from client_type');
assert(newPageSrc.includes('address: address.trim() || null'), 'TEST 21 - Insert payload persists policy street address');
assert(newPageSrc.includes('city: city.trim() || null'), 'TEST 22 - Insert payload persists policy city');
assert(newPageSrc.includes('state: state.trim() || null'), 'TEST 23 - Insert payload persists policy state');
assert(newPageSrc.includes('zip_code: zipCode.trim() || null'), 'TEST 24 - Insert payload persists policy zip_code');
assert(newPageSrc.includes('Use Address on File'), 'TEST 25 - Form includes Use Address on File checkbox option');

console.log('\n====================================================');
console.log(`SUMMARY RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
