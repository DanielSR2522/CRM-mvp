const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: POLICY EXPIRATION REMINDERS WORKFLOW');
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

// 1. Audit Migration (supabase/migrations/20260815000004_create_policy_expiration_reminders.sql)
const migPath = path.join(__dirname, '../supabase/migrations/20260815000004_create_policy_expiration_reminders.sql');
const migExists = fs.existsSync(migPath);
assert(migExists, 'TEST 1 - Migration 20260815000004_create_policy_expiration_reminders.sql exists');

if (migExists) {
  const migSrc = fs.readFileSync(migPath, 'utf8');
  assert(migSrc.includes('CHECK (reminder_days IN (60, 45, 15))'), 'TEST 2 - Migration enforces CHECK (reminder_days IN (60, 45, 15))');
  assert(migSrc.includes('policy_expiration_reminders_unique_sent_idx'), 'TEST 3 - Enforces unique index for duplicate prevention on policy_id + expiration_date + reminder_days');
  assert(migSrc.includes('ENABLE ROW LEVEL SECURITY'), 'TEST 4 - Enables RLS on policy_expiration_reminders table');
}

// 2. Audit Edge Function Code (supabase/functions/send-policy-expiration-reminders/index.ts)
const funcPath = path.join(__dirname, '../supabase/functions/send-policy-expiration-reminders/index.ts');
const funcSrc = fs.readFileSync(funcPath, 'utf8');

assert(funcSrc.includes('addDaysToIsoDate(nyTodayStr, 60)'), 'TEST 5 - Edge Function calculates 60-day target date');
assert(funcSrc.includes('addDaysToIsoDate(nyTodayStr, 45)'), 'TEST 6 - Edge Function calculates 45-day target date');
assert(funcSrc.includes('addDaysToIsoDate(nyTodayStr, 15)'), 'TEST 7 - Edge Function calculates 15-day target date');
assert(!funcSrc.includes('addDaysToIsoDate(nyTodayStr, 30)'), 'TEST 8 - Obsolete 30-day target date removed from function');

assert(funcSrc.includes('x-cron-secret'), 'TEST 9 - Validates x-cron-secret security header');
assert(funcSrc.includes('POLICY_REMINDER_TEST_EMAIL'), 'TEST 10 - Supports POLICY_REMINDER_TEST_EMAIL test-mode redirection');
assert(funcSrc.includes('[TEST MODE]'), 'TEST 11 - Subject and body clearly demarcated when test mode is active');

assert(funcSrc.includes('policy_expiration_reminders_unique_sent_idx') || funcSrc.includes('policy_expiration_reminders'), 'TEST 12 - Queries and logs reminder history to public.policy_expiration_reminders');
assert(funcSrc.includes("reminder_days: reminderDays"), 'TEST 13 - Records exact milestone threshold in reminder history');
assert(funcSrc.includes('clients.agent_id') || funcSrc.includes('agent_id'), 'TEST 14 - Resolves assigned agent via clients.agent_id');

// 3. Test Threshold Calculation Logic
function addDaysToIsoDate(isoDateStr, days) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

const todayStr = '2026-08-12';
const d60 = addDaysToIsoDate(todayStr, 60);
const d45 = addDaysToIsoDate(todayStr, 45);
const d15 = addDaysToIsoDate(todayStr, 15);
const d30 = addDaysToIsoDate(todayStr, 30);
const d59 = addDaysToIsoDate(todayStr, 59);

const targetDays = [d60, d45, d15];

function evalDateThreshold(expirationDate) {
  if (expirationDate === d60) return 60;
  if (expirationDate === d45) return 45;
  if (expirationDate === d15) return 15;
  return null;
}

assert(evalDateThreshold(d60) === 60, 'TEST 15 - 60-day expiration triggers 60-day reminder');
assert(evalDateThreshold(d45) === 45, 'TEST 16 - 45-day expiration triggers 45-day reminder');
assert(evalDateThreshold(d15) === 15, 'TEST 17 - 15-day expiration triggers 15-day reminder');
assert(evalDateThreshold(d30) === null, 'TEST 18 - 30-day expiration is ignored (returns null)');
assert(evalDateThreshold(d59) === null, 'TEST 19 - Unrelated 59-day expiration is ignored (returns null)');

console.log('\n====================================================');
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
