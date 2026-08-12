const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: P&C POLICY LIFECYCLE (TYPE, RENEW, CANCEL)');
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

// 1. Audit Migration File (supabase/migrations/20260816000000_add_policy_lifecycle_fields.sql)
const migPath = path.join(__dirname, '../supabase/migrations/20260816000000_add_policy_lifecycle_fields.sql');
const migExists = fs.existsSync(migPath);
assert(migExists, 'TEST 1 - Migration 20260816000000_add_policy_lifecycle_fields.sql exists');

if (migExists) {
  const migSrc = fs.readFileSync(migPath, 'utf8');
  assert(migSrc.includes('renewed_from_policy_id UUID REFERENCES public.policies(id)'), 'TEST 2 - Migration adds renewed_from_policy_id FK');
  assert(migSrc.includes('cancelled_at TIMESTAMPTZ NULL'), 'TEST 3 - Migration adds cancelled_at timestamp');
  assert(migSrc.includes('cancellation_reason TEXT NULL'), 'TEST 4 - Migration adds cancellation_reason column');
  assert(migSrc.includes('policies_renewed_from_idx'), 'TEST 5 - Migration creates index on renewed_from_policy_id');
}

// 2. Audit P&C Policy Profile Component Code (src/app/clients/[id]/policies/[policyId]/page.tsx)
const pagePath = path.join(__dirname, '../src/app/clients/[id]/policies/[policyId]/page.tsx');
const pageSrc = fs.readFileSync(pagePath, 'utf8');

assert(pageSrc.includes('<label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Type</label>'), 'TEST 6 - Summary form contains visible POLICY TYPE label');
assert(pageSrc.includes("policy_ownership_type: (client?.client_type === 'company' || policyOwnershipType === 'company') ? 'company' : 'personal'"), 'TEST 7 - Summary save updates policy_ownership_type atomically');
assert(pageSrc.includes('handleRenewPolicySubmit'), 'TEST 8 - Page implements handleRenewPolicySubmit workflow handler');
assert(pageSrc.includes('handleCancelPolicySubmit'), 'TEST 9 - Page implements handleCancelPolicySubmit workflow handler');
assert(pageSrc.includes('renewed_from_policy_id: policyId'), 'TEST 10 - Renew workflow sets renewed_from_policy_id to source policy ID');
assert(pageSrc.includes('status: \'Pending\''), 'TEST 11 - Renewed policy defaults to Pending status');
assert(pageSrc.includes('status: \'Cancelled\''), 'TEST 12 - Cancel workflow sets policy status to Cancelled');
assert(pageSrc.includes('cancelled_at: nowIso'), 'TEST 13 - Cancel workflow sets cancelled_at timestamp');
assert(pageSrc.includes('cancellation_reason: reasonFull'), 'TEST 14 - Cancel workflow persists cancellation reason and notes');
assert(pageSrc.includes('A renewal has been created for this policy'), 'TEST 15 - UI detects existing renewal and displays warning notice');

// 3. Audit Overview & Expiration Reminders Exclusions
const overviewPath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const overviewSrc = fs.readFileSync(overviewPath, 'utf8');
assert(overviewSrc.includes("if (p.status === 'Active')"), 'TEST 16 - Client Overview active cards filter for status = Active (excluding Cancelled)');

const funcPath = path.join(__dirname, '../supabase/functions/send-policy-expiration-reminders/index.ts');
const funcSrc = fs.readFileSync(funcPath, 'utf8');
assert(funcSrc.includes(".eq('status', 'Active')"), 'TEST 17 - Policy expiration reminder Edge Function queries status = Active (excluding Cancelled)');

console.log('\n====================================================');
console.log(`SUMMARY RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
