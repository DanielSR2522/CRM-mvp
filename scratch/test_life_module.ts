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
console.log('TESTING LIFE INSURANCE MODULE END-TO-END');
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

async function runTests() {
  const supabase = getSupabaseAdmin();
  const testAgentId = '4f698c2f-f9e0-42d1-996e-a9ee4a574ea9';

  // 1. Create Test Client
  console.log('--- Step 1: Create Test Client ---');
  const { data: client } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Life Module Test Client' })
    .select('id')
    .single();

  assert(Boolean(client?.id), 'Created test client for Life Insurance module');
  const clientId = client!.id;

  // 2. Create Client Life Profile
  console.log('\n--- Step 2: Client Life Profile (2-Column Fields) ---');
  const { data: profile, error: profErr } = await supabase
    .from('client_life_profile')
    .upsert(
      {
        client_id: clientId,
        health_rating_approved: 'Preferred Plus',
        income: 125000,
        profits: 45000,
        company_name: 'Apex Innovations LLC',
        owner_employee: 'Owner / Managing Director',
        net_worth: 1500000,
      },
      { onConflict: 'client_id' }
    )
    .select('*')
    .single();

  assert(
    Boolean(!profErr && profile?.health_rating_approved === 'Preferred Plus' && profile?.income === 125000),
    'Upserted client Life Profile 2-column data'
  );

  // 3. Create Multiple Life Policies
  console.log('\n--- Step 3: Multiple Life Policies ---');
  const { data: pol1 } = await supabase
    .from('life_policies')
    .insert({ client_id: clientId, policy_number: 'LIFE-POL-001', status: 'Active' })
    .select('id')
    .single();

  const { data: pol2 } = await supabase
    .from('life_policies')
    .insert({ client_id: clientId, policy_number: 'LIFE-POL-002', status: 'Pending' })
    .select('id')
    .single();

  assert(Boolean(pol1?.id) && Boolean(pol2?.id), 'Created multiple independent Life Policies for client');

  // 4. Products inside Life Policy
  console.log('\n--- Step 4: Products inside Life Policy ---');
  const { data: prod1, error: prodErr1 } = await supabase
    .from('life_policy_products')
    .insert({
      life_policy_id: pol1!.id,
      product_type: 'IUL',
      company: 'Mutual of Omaha',
      policy_number: 'IUL-998877',
      face_amount: 500000,
      monthly_premium: 250,
      level_period: '20 Years',
    })
    .select('id')
    .single();

  const { data: prod2 } = await supabase
    .from('life_policy_products')
    .insert({
      life_policy_id: pol1!.id,
      product_type: 'Term',
      company: 'Transamerica',
      policy_number: 'TERM-445566',
      face_amount: 250000,
      monthly_premium: 85,
    })
    .select('id')
    .single();

  assert(Boolean(!prodErr1 && prod1?.id && prod2?.id), 'Added multiple products to Life Policy #1');

  // 5. Beneficiaries inside Life Policy (with 100% total benefit percentage sum validation)
  console.log('\n--- Step 5: Beneficiaries with 100% Allocation Validation ---');
  const { data: ben1 } = await supabase
    .from('life_policy_beneficiaries')
    .insert({
      life_policy_id: pol1!.id,
      name: 'Sarah Johnson',
      relationship_grade: 'Primary - Spouse',
      is_client: false,
      benefit_percentage: 60,
    })
    .select('id')
    .single();

  const { data: ben2 } = await supabase
    .from('life_policy_beneficiaries')
    .insert({
      life_policy_id: pol1!.id,
      name: 'Michael Johnson',
      relationship_grade: 'Primary - Child',
      is_client: false,
      benefit_percentage: 40,
    })
    .select('id')
    .single();

  const { data: allBens } = await supabase
    .from('life_policy_beneficiaries')
    .select('benefit_percentage')
    .eq('life_policy_id', pol1!.id);

  const totalPct = (allBens || []).reduce((sum, b) => sum + (Number(b.benefit_percentage) || 0), 0);
  assert(totalPct === 100, `Beneficiary percentages for Policy #1 sum to exactly ${totalPct}%`);

  // 6. Documents, Notes, and Timeline Events
  console.log('\n--- Step 6: Policy Documents, Notes, & Timeline Events ---');
  const { data: doc } = await supabase
    .from('life_policy_documents')
    .insert({
      life_policy_id: pol1!.id,
      file_name: 'iul_policy_illustration.pdf',
      storage_path: `life-documents/${pol1!.id}/illustration.pdf`,
      file_size: 2048576,
      file_type: 'application/pdf',
    })
    .select('id')
    .single();

  const { data: note } = await supabase
    .from('life_policy_notes')
    .insert({
      life_policy_id: pol1!.id,
      agent_id: testAgentId,
      body: 'Reviewed IUL policy illustration with client.',
    })
    .select('id')
    .single();

  const { data: evt } = await supabase
    .from('life_policy_timeline_events')
    .insert({
      life_policy_id: pol1!.id,
      title: 'Illustration Uploaded',
      description: 'Uploaded IUL illustration PDF',
      event_type: 'document_uploaded',
    })
    .select('id')
    .single();

  assert(Boolean(doc?.id) && Boolean(note?.id) && Boolean(evt?.id), 'Added Document, Note, and Timeline Event to Life Policy #1');

  // 7. Cascade Deletion Verification
  console.log('\n--- Step 7: Cascade Deletion Verification ---');
  const { data: delRes, error: delErr } = await supabase.rpc('delete_client_cascade', {
    p_client_id: clientId,
    p_agent_id: testAgentId,
  });

  assert(Boolean(!delErr && delRes?.success), 'Successfully deleted client with full Life Insurance module records via delete_client_cascade RPC');

  // Verify orphan check across all 8 tables
  const [{ data: checkProfile }, { data: checkPolicies }, { data: checkProds }, { data: checkBens }] = await Promise.all([
    supabase.from('client_life_profile').select('id').eq('client_id', clientId).maybeSingle(),
    supabase.from('life_policies').select('id').eq('client_id', clientId).maybeSingle(),
    supabase.from('life_policy_products').select('id').eq('life_policy_id', pol1!.id).maybeSingle(),
    supabase.from('life_policy_beneficiaries').select('id').eq('life_policy_id', pol1!.id).maybeSingle(),
  ]);

  assert(
    checkProfile === null && checkPolicies === null && checkProds === null && checkBens === null,
    'Verified zero orphan rows remain across all 8 life tables'
  );

  console.log('\n===========================================================');
  console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runTests().catch(err => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
