import fs from 'fs';
import path from 'path';

console.log('===========================================================');
console.log('TESTING COMPLETE PERSONAL INFO CARDS & FIELDS RESTORATION');
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

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const content = fs.readFileSync(targetFile, 'utf-8');

// 1. Verify "Edit Info" button is NOT present
assert(!content.includes('Edit Info'), 'Section-level "Edit Info" button is 100% absent');

// 2. Verify all 3 cards are present
assert(content.includes('Personal Information</h3>'), 'Personal Information card present');
assert(content.includes('Residence Information</h3>'), 'Residence Information card present');
assert(content.includes('Income Information</h3>'), 'Income Information card present');

// 3. Verify handlers are present
assert(content.includes('savePersonalField'), 'savePersonalField atomic handler present');
assert(content.includes('saveCoApplicantField'), 'saveCoApplicantField atomic handler present');
assert(content.includes('saveResidenceField'), 'saveResidenceField atomic handler present');
assert(content.includes('saveIncomeField'), 'saveIncomeField atomic handler present');

// 4. Verify residence & income table references
assert(content.includes("from('client_residence_information')"), 'Supabase client_residence_information table queried');
assert(content.includes("from('client_income_information')"), 'Supabase client_income_information table queried');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
