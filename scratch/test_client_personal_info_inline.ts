import fs from 'fs';
import path from 'path';
import { formatSSN } from '../src/lib/formatters/ssn';
import { formatUSPhone } from '../src/lib/formatters/phone';
import { formatDateMMDDYYYY } from '../src/lib/formatters/date';

console.log('===========================================================');
console.log('TESTING CLIENT DETAIL PERSONAL INFO TRUE INLINE EDITING');
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

// 1. Verify "Edit Info" button is completely removed
const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const fileContent = fs.readFileSync(filePath, 'utf-8');

const hasEditInfoButton = fileContent.includes('Edit Info');
assert(!hasEditInfoButton, 'Section-level "Edit Info" button is completely removed from page.tsx');

// 2. Format verification
assert(formatSSN('782555555') === '782-55-5555', 'Primary & Co-Applicant SSN formats as 782-55-5555');
assert(formatUSPhone('3055550199') === '305-555-0199', 'Primary & Co-Applicant Phone formats as 305-555-0199');
assert(formatDateMMDDYYYY('1997-06-16') === '06/16/1997', 'Primary & Co-Applicant DOB formats as 06/16/1997');

// 3. Verify single field save handlers present in code
assert(fileContent.includes('savePersonalField'), 'savePersonalField atomic handler integrated');
assert(fileContent.includes('saveCoApplicantField'), 'saveCoApplicantField atomic handler integrated');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
