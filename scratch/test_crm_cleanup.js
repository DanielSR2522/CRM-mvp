const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: FOCUSED CRM CLEANUP AUDIT');
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

// 1. Audit Client Profile Page (src/app/clients/[id]/page.tsx)
const clientProfilePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const clientProfileContent = fs.readFileSync(clientProfilePath, 'utf8');

// TEST A: Agency field is absent from sidebar
const agencyInSidebar = clientProfileContent.includes('agency_name') && clientProfileContent.includes('Agency</span>');
assert(!agencyInSidebar, 'TEST A — Agency field absent from client profile sidebar');

// TEST B & C: No obsolete Agency field or placeholder in Personal Info / Company Info
const agencyInPersonalInfo = /label="Agency"/i.test(clientProfileContent);
assert(!agencyInPersonalInfo, 'TEST B & C — No obsolete Agency field in Personal/Company Info');

// TEST D: Linked Companies section is completely absent from P&C policy detail page
const policyDetailPath = path.join(__dirname, '../src/app/clients/[id]/policies/[policyId]/page.tsx');
const policyDetailContent = fs.readFileSync(policyDetailPath, 'utf8');

const linkedCompaniesHeader = /Linked Companies/i.test(policyDetailContent);
const addCompanyButton = /\+ Add Company/i.test(policyDetailContent);
const noCompaniesLinkedText = /No companies linked to this personal policy yet/i.test(policyDetailContent);

assert(!linkedCompaniesHeader && !addCompanyButton && !noCompaniesLinkedText, 'TEST D — Linked Companies section completely absent from P&C policy detail page');

// TEST E: Policy Summary still saves normally
const hasSummarySubmit = policyDetailContent.includes('handleSubmit') && policyDetailContent.includes('Save Summary');
assert(hasSummarySubmit, 'TEST E — Policy Summary save form logic intact');

// TEST F: Policy Address still displays/saves correctly
const hasPolicyAddress = policyDetailContent.includes('useAddressOnFile') && policyDetailContent.includes('Street Address');
assert(hasPolicyAddress, 'TEST F — Policy Address display & save logic intact');

// TEST G: Writing Company and Broker Name remain intact
const hasWritingCompanyAndBroker = policyDetailContent.includes('writingCompany') && policyDetailContent.includes('brokerName');
assert(hasWritingCompanyAndBroker, 'TEST G — Writing Company and Broker Name intact');

// TEST H: Open Personal client linked to Company (Linked Company card intact on client profile)
const hasLinkedCompanyCard = clientProfileContent.includes('LINKED COMPANY') || clientProfileContent.includes('Linked Companies');
assert(hasLinkedCompanyCard, 'TEST H — Linked Company card intact on Personal Client profile');

// TEST I: Open Personal Overview (Surfacing linked company policies)
const hasOverviewCompanySurfacing = clientProfileContent.includes('fetchLinkedCompanyPolicies') && clientProfileContent.includes('linkedCompanyPolicies');
assert(hasOverviewCompanySurfacing, 'TEST I — Personal Overview surfaces linked Company policies automatically');

// TEST J: Open Company Profile (Linked Personal Contact intact)
const hasLinkedPersonalContactCard = clientProfileContent.includes('Linked Personal Contact');
assert(hasLinkedPersonalContactCard, 'TEST J — Linked Personal Contact card intact on Company profile');

// TEST K & L: No regression to Policy Creation (src/app/clients/[id]/policies/new/page.tsx)
const newPolicyPath = path.join(__dirname, '../src/app/clients/[id]/policies/new/page.tsx');
const newPolicyContent = fs.readFileSync(newPolicyPath, 'utf8');

const newPolicyHasWritingCompany = newPolicyContent.includes('writingCompany') && newPolicyContent.includes('brokerName');
const newPolicyHasPerPolicyLink = newPolicyContent.includes('selectedCompanies') || newPolicyContent.includes('personal_policy_companies');
assert(newPolicyHasWritingCompany && !newPolicyHasPerPolicyLink, 'TEST K & L — Policy Creation intact without obsolete per-policy company linking');

console.log('\n====================================================');
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
