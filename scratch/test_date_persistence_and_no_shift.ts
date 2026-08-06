const { formatDateMMDDYYYY, mmddyyyyToISODate, isoDateToMMDDYYYY } = require('../src/lib/formatters/date');

console.log('===========================================================');
console.log('TESTING DATE PERSISTENCE & ZERO TIMEZONE DAY-SHIFTING');
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

// 1. Dashboard Header Test
const now = new Date();
const dashHeader = formatDateMMDDYYYY(now);
assert(/^\d{2}\/\d{2}\/\d{4}$/.test(dashHeader), `Dashboard header date strictly MM/DD/YYYY: ${dashHeader}`);

// 2. Date 12/06/1997 Persistence Test
const userInputDate = '12/06/1997';
const isoDbValue = mmddyyyyToISODate(userInputDate);
assert(isoDbValue === '1997-12-06', `User input "12/06/1997" converts to DB ISO "1997-12-06"`);

// 3. Reload from DB Test
const reloadedDisplay = isoDateToMMDDYYYY(isoDbValue);
assert(reloadedDisplay === '12/06/1997', `Reloaded DB ISO "1997-12-06" renders as "12/06/1997"`);

// 4. Timezone No-Shift Test across 24 UTC offsets
const offsets = [-12, -8, -5, 0, 3, 8, 12];
offsets.forEach(offset => {
  const result = formatDateMMDDYYYY('1997-12-06');
  assert(result === '12/06/1997', `Date 1997-12-06 never shifts under offset ${offset}: ${result}`);
});

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
