const { formatDateMMDDYYYY, formatDateTimeMMDDYYYY, mmddyyyyToISODate, isoDateToMMDDYYYY } = require('../src/lib/formatters/date');
const { formatSSN, maskSSN, normalizeSSN, isValidSSNLength } = require('../src/lib/formatters/ssn');
const { formatUSPhone, extractUSPhoneDigits, isValidUSPhoneLength } = require('../src/lib/formatters/phone');

console.log('===========================================================');
console.log('TESTING CRM-WIDE STANDARDIZED FORMATTERS & DATA COMPLIANCE');
console.log('===========================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
}

// 1. DATE FORMATTING TESTS
console.log('--- 1. DATE FORMATTING ---');
assert(formatDateMMDDYYYY('2026-08-05') === '08/05/2026', 'Date-only YYYY-MM-DD formats to MM/DD/YYYY');
assert(formatDateMMDDYYYY('1997-12-06') === '12/06/1997', 'Date-only 1997-12-06 formats to 12/06/1997 without UTC day-shift');
assert(mmddyyyyToISODate('08/05/2026') === '2026-08-05', 'MM/DD/YYYY converts to ISO YYYY-MM-DD for DB');
assert(mmddyyyyToISODate('08052026') === '2026-08-05', 'Raw MMDDYYYY digits convert to ISO YYYY-MM-DD');
assert(formatDateMMDDYYYY(null) === '', 'Null date returns empty string');
assert(formatDateMMDDYYYY('') === '', 'Empty date returns empty string');
assert(formatDateMMDDYYYY('invalid-date') === '', 'Invalid date returns empty string');

// 2. SSN FORMATTING & MASKING TESTS
console.log('\n--- 2. SSN FORMATTING & MASKING ---');
assert(formatSSN('1') === '1', 'SSN 1 digit -> 1');
assert(formatSSN('123') === '123', 'SSN 3 digits -> 123');
assert(formatSSN('1234') === '123-4', 'SSN 4 digits -> 123-4');
assert(formatSSN('12345') === '123-45', 'SSN 5 digits -> 123-45');
assert(formatSSN('123456789') === '123-45-6789', 'SSN 9 digits -> 123-45-6789');
assert(formatSSN(' 123-45 6789 ') === '123-45-6789', 'SSN paste with spaces/hyphens -> 123-45-6789');
assert(maskSSN('123456789') === '***-**-6789', 'SSN mask full SSN -> ***-**-6789');
assert(maskSSN('***-**-1234') === '***-**-1234', 'SSN mask already masked -> ***-**-1234');
assert(normalizeSSN('123-45-6789') === '123456789', 'SSN normalize -> 123456789');
assert(isValidSSNLength('123-45-6789') === true, 'Complete SSN length valid');
assert(isValidSSNLength('123-45') === false, 'Incomplete SSN length invalid');

// 3. PHONE FORMATTING TESTS
console.log('\n--- 3. PHONE FORMATTING ---');
assert(formatUSPhone('1') === '1', 'Phone 1 digit -> 1');
assert(formatUSPhone('123') === '123', 'Phone 3 digits -> 123');
assert(formatUSPhone('1234') === '123-4', 'Phone 4 digits -> 123-4');
assert(formatUSPhone('1234567') === '123-456-7', 'Phone 7 digits -> 123-456-7');
assert(formatUSPhone('1234567890') === '123-456-7890', 'Phone 10 digits -> 123-456-7890');
assert(formatUSPhone('+1 (123) 456-7890') === '123-456-7890', 'Phone paste +1 (123) 456-7890 -> 123-456-7890');
assert(extractUSPhoneDigits('+11234567890') === '1234567890', 'Extract 11-digit leading +1 -> 10 digits');
assert(isValidUSPhoneLength('123-456-7890') === true, 'Complete 10-digit phone valid');
assert(isValidUSPhoneLength('123-456') === false, 'Incomplete phone invalid');

console.log('\n===========================================================');
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('===========================================================');
