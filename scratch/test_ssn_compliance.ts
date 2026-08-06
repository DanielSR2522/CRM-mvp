import { formatSSN, normalizeSSN, maskSSN, isValidSSNLength } from '../src/lib/formatters/ssn';
import { formatUSPhone, normalizeUSPhone } from '../src/lib/formatters/phone';

console.log('===========================================================');
console.log('TESTING CLIENT DETAIL SSN & PHONE COMPLIANCE');
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

// 1. Raw DB SSN display test for Client Detail (Primary & Co-Applicant)
const rawDbSsn = '782555555';
const formattedSsn = formatSSN(rawDbSsn);
assert(formattedSsn === '782-55-5555', `Raw DB SSN "${rawDbSsn}" displays formatted as "${formattedSsn}"`);

// 2. Typing / Pasting SSN test
const typedSsn = '782555555';
const formattedTyped = formatSSN(typedSsn);
assert(formattedTyped === '782-55-5555', `Typing 782555555 in SSNInput formats as 782-55-5555`);

// 3. Masked SSN test (for security policies requiring masking)
const maskedSsn = maskSSN(rawDbSsn);
assert(maskedSsn === '***-**-5555', `Masked SSN displays as ***-**-5555`);

// 4. Persistence & Normalization
const normalized = normalizeSSN(formattedSsn);
assert(normalized === '782555555', `Normalized SSN strips hyphens cleanly: 782555555`);
assert(isValidSSNLength(formattedSsn) === true, `Formatted SSN 782-55-5555 satisfies 9-digit validation`);

// 5. Primary & Co-Applicant Phone formatting
const rawPhone = '3055550199';
const formattedPhone = formatUSPhone(rawPhone);
assert(formattedPhone === '305-555-0199', `Raw DB Phone "${rawPhone}" displays formatted as "${formattedPhone}"`);

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
