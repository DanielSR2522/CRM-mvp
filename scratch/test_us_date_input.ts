import { formatDateForDisplay, parseDateForStorage, isValidUSDate } from '../src/lib/formatters/date';

console.log('===========================================================');
console.log('TESTING LIFE MODULE US DATE FORMATTING & VALIDATION');
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

// 1. Display formatting YYYY-MM-DD -> MM/DD/YYYY
const display1 = formatDateForDisplay('2026-08-06');
assert(display1 === '08/06/2026', 'formatDateForDisplay("2026-08-06") returns "08/06/2026"');

// 2. Storage parsing MM/DD/YYYY -> YYYY-MM-DD
const storage1 = parseDateForStorage('08/06/2026');
assert(storage1 === '2026-08-06', 'parseDateForStorage("08/06/2026") returns "2026-08-06"');

// 3. Round-trip date persistence (no one-day shift)
const roundTrip = parseDateForStorage(formatDateForDisplay('2026-08-06'));
assert(roundTrip === '2026-08-06', 'Round-trip storage -> display -> storage preserves exact date "2026-08-06"');

// 4. Valid US Date check
assert(isValidUSDate('08/06/2026') === true, 'isValidUSDate("08/06/2026") returns true');

// 5. Invalid date checks
assert(isValidUSDate('13/40/2026') === false, 'isValidUSDate("13/40/2026") correctly rejects invalid month 13 & day 40');
assert(isValidUSDate('02/30/2026') === false, 'isValidUSDate("02/30/2026") correctly rejects invalid February 30th');

// 6. Leap year checks
assert(isValidUSDate('02/29/2024') === true, 'isValidUSDate("02/29/2024") correctly accepts valid leap year 02/29/2024');
assert(isValidUSDate('02/29/2025') === false, 'isValidUSDate("02/29/2025") correctly rejects non-leap year 02/29/2025');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');

export {};
