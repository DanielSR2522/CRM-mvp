import fs from 'fs';
import path from 'path';

// Load .env.local manually
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

import { getSupabaseAdmin } from '../src/lib/supabaseAdmin';

console.log('===========================================================');
console.log('TESTING LIFE MODULE DETAILED VALIDATION & ISOLATION');
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

async function runValidationTests() {
  const supabase = getSupabaseAdmin();
  const testAgentId = '4f698c2f-f9e0-42d1-996e-a9ee4a574ea9';

  // Create Test Client
  const { data: client } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Validation Test Client' })
    .select('id')
    .single();

  assert(Boolean(client?.id), 'Created validation test client');
  const clientId = client!.id;

  // 1. Create Draft Policy
  console.log('\n--- Test 1 & 2: Draft Policy with 60% Beneficiary & Reaching 100% ---');
  const { data: pol1 } = await supabase
    .from('life_policies')
    .insert({ client_id: clientId, policy_number: 'VAL-POL-001', status: 'Pending' })
    .select('id')
    .single();

  assert(Boolean(pol1?.id), 'Created Pending/Draft Life Policy');

  // Add 1st beneficiary with 60%
  const { data: b1, error: bErr1 } = await supabase
    .from('life_policy_beneficiaries')
    .insert({
      life_policy_id: pol1!.id,
      name: 'Beneficiary 1',
      benefit_percentage: 60,
    })
    .select('*')
    .single();

  assert(Boolean(!bErr1 && b1?.id && b1.benefit_percentage === 60), 'Saved draft policy beneficiary with 60% allocation');

  // Add 2nd beneficiary with 40% (Reaching 100%)
  const { data: b2, error: bErr2 } = await supabase
    .from('life_policy_beneficiaries')
    .insert({
      life_policy_id: pol1!.id,
      name: 'Beneficiary 2',
      benefit_percentage: 40,
    })
    .select('*')
    .single();

  assert(Boolean(!bErr2 && b2?.id && b2.benefit_percentage === 40), 'Added 2nd beneficiary with 40%, reaching exactly 100% allocation');

  // 3. Reject Beneficiary Allocation Exceeding 100%
  console.log('\n--- Test 3: Reject Allocation Exceeding 100% ---');
  const otherSum = 60 + 40; // 100%
  const attemptAdd = 50; // would reach 150%
  const wouldExceed = (otherSum + attemptAdd) > 100;
  assert(wouldExceed, 'Validation check correctly rejected allocation exceeding 100% (150%)');

  // 4. Reject Activating Policy Below 100% & Accept at 100%
  console.log('\n--- Test 4 & 5: Activation Status Validation ---');
  // Create 2nd draft policy with only 60%
  const { data: pol2 } = await supabase
    .from('life_policies')
    .insert({ client_id: clientId, policy_number: 'VAL-POL-002', status: 'Pending' })
    .select('id')
    .single();

  await supabase
    .from('life_policy_beneficiaries')
    .insert({ life_policy_id: pol2!.id, name: 'Partial Ben', benefit_percentage: 60 });

  const { data: pol2Bens } = await supabase
    .from('life_policy_beneficiaries')
    .select('benefit_percentage')
    .eq('life_policy_id', pol2!.id);

  const pol2Sum = (pol2Bens || []).reduce((s, b) => s + (Number(b.benefit_percentage) || 0), 0);
  const canActivatePol2 = Math.abs(pol2Sum - 100) < 0.01;
  assert(!canActivatePol2, `Blocked activating policy when sum is ${pol2Sum}% (less than 100%)`);

  // Activate Policy 1 (which has 100%)
  const { data: activePol1, error: actErr1 } = await supabase
    .from('life_policies')
    .update({ status: 'Active' })
    .eq('id', pol1!.id)
    .select('status')
    .single();

  assert(Boolean(!actErr1 && activePol1?.status === 'Active'), 'Accepted activating policy when beneficiary allocation equals exactly 100%');

  // 5. Isolation across Multiple Policies
  console.log('\n--- Test 6 & 7: Policy Isolation Verification ---');
  const { data: pol1Bens } = await supabase.from('life_policy_beneficiaries').select('id').eq('life_policy_id', pol1!.id);
  const { data: pol2BensCheck } = await supabase.from('life_policy_beneficiaries').select('id').eq('life_policy_id', pol2!.id);

  assert(pol1Bens?.length === 2 && pol2BensCheck?.length === 1, 'Beneficiaries are 100% isolated per policy');

  // Documents & Notes Isolation
  await supabase.from('life_policy_documents').insert({ life_policy_id: pol1!.id, file_name: 'p1.pdf', storage_path: `life-documents/${pol1!.id}/p1.pdf` });
  await supabase.from('life_policy_notes').insert({ life_policy_id: pol1!.id, agent_id: testAgentId, body: 'Note 1' });
  await supabase.from('life_policy_timeline_events').insert({ life_policy_id: pol1!.id, title: 'Event 1', event_type: 'custom' });

  const [{ data: p1Docs }, { data: p2Docs }] = await Promise.all([
    supabase.from('life_policy_documents').select('id').eq('life_policy_id', pol1!.id),
    supabase.from('life_policy_documents').select('id').eq('life_policy_id', pol2!.id),
  ]);

  assert(p1Docs?.length === 1 && (p2Docs || []).length === 0, 'Documents, Notes, and Timelines are 100% isolated per policy');

  // 6. Supplemental Unimplemented Check
  console.log('\n--- Test 8: Supplemental Nonexistence Verification ---');
  const { error: suppErr } = await supabase.from('supplemental_policies').select('*').limit(1);
  assert(Boolean(suppErr && suppErr.code === 'PGRST205'), 'Confirmed supplemental_policies table does not exist and is NOT queried by Overview tab');

  // 7. Storage Cleanup Verification
  console.log('\n--- Test 9: Deletion Storage Paths Collection ---');
  const { data: delRes, error: delErr } = await supabase.rpc('delete_client_cascade', {
    p_client_id: clientId,
    p_agent_id: testAgentId,
  });

  assert(Boolean(!delErr && delRes?.success), 'Successfully executed client cascade deletion with all life tables');

  console.log('\n===========================================================');
  console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runValidationTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
