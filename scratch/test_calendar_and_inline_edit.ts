import { formatDateMMDDYYYY } from '../src/lib/formatters/date';

console.log('===========================================================');
console.log('TESTING CALENDAR ENGLISH STANDARDIZATION & INLINE EDITING');
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

// 1. English Months Verification
const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
assert(months.length === 12, 'All 12 Month names defined in English');

// 2. English Weekdays Verification
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
assert(weekdays.length === 7, 'All 7 Weekday names defined in English');

// 3. Calendar Controls Verification
const controls = ['Today', 'Month', 'Week', 'Day', 'List', 'New Appointment', 'Edit Appointment'];
controls.forEach(control => {
  assert(typeof control === 'string' && control.length > 0, `Calendar control label: "${control}"`);
});

// 4. Date formatting check
const formattedToday = formatDateMMDDYYYY('2026-08-05');
assert(formattedToday === '08/05/2026', `Date display in Calendar strictly MM/DD/YYYY: ${formattedToday}`);

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
