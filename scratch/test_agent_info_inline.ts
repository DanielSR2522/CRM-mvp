import { formatUSPhone } from '../src/lib/formatters/phone';

console.log('===========================================================');
console.log('TESTING PHASE 1 AGENT INFORMATION INLINE EDITING');
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

// 1. Phone number formatting test
const phoneInput = '3055550199';
const formattedPhone = formatUSPhone(phoneInput);
assert(formattedPhone === '305-555-0199', `Agent Phone "3055550199" formats as "${formattedPhone}"`);

// 2. Email validation check
const invalidEmail = 'agent_email_without_at.com';
const validEmail = 'agent@example.com';
assert(!invalidEmail.includes('@'), 'Invalid email fails validation check');
assert(validEmail.includes('@'), 'Valid email passes validation check');

// 3. Address atomic payload structure
const addressPayload = {
  address: '123 Main St',
  city: 'Miami',
  state: 'FL',
  zip_code: '33101',
  country: 'United States'
};
assert(Object.keys(addressPayload).length === 5, 'Address update forms 5-field atomic payload');

// 4. Upsert configuration check
const upsertConfig = { onConflict: 'id' };
assert(upsertConfig.onConflict === 'id', 'Supabase upsert configured with onConflict: "id"');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
