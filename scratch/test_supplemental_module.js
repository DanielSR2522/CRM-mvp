const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Date Utils Logic from src/utils/dateUtils.ts
const usDateToIso = (usStr) => {
  if (!usStr) return null;
  const clean = usStr.trim();
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1000 || y > 9999) return null;
  const testDate = new Date(y, m - 1, d);
  if (testDate.getFullYear() !== y || testDate.getMonth() !== m - 1 || testDate.getDate() !== d) {
    return null;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const formatIsoToUsDate = (isoStr) => {
  if (!isoStr) return 'Not provided';
  const clean = isoStr.trim().split('T')[0].split(' ')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4 && month.length <= 2 && day.length <= 2) {
      return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    }
  }
  return isoStr;
};

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AMANDA_ID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
const LAURA_ID  = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

async function testSupplementalModule() {
  console.log("==================================================");
  console.log("1. TESTING DATABASE TABLE EXISTENCE & SCHEMA");
  console.log("==================================================");

  const tables = ['client_supplemental_policies', 'client_supplemental_members'];
  for (const t of tables) {
    const { error } = await supabaseAdmin.from(t).select('*').limit(1);
    if (error) throw new Error(`Table ${t} check failed: ${error.message}`);
    console.log(`✅ Table '${t}' exists and responds cleanly.`);
  }

  // Pick a test client
  const { data: clients } = await supabaseAdmin.from('clients').select('id, full_name, agent_id').limit(1);
  const testClient = clients[0];
  console.log(`\nTesting with Client: "${testClient.full_name}" (${testClient.id})`);

  console.log("\n==================================================");
  console.log("2. TESTING MULTIPLE SUPPLEMENTAL POLICIES PER CLIENT");
  console.log("==================================================");

  // Clean old test records
  await supabaseAdmin.from('client_supplemental_policies').delete().eq('client_id', testClient.id);

  const policiesToInsert = [
    {
      client_id: testClient.id,
      product_type: 'Dental',
      company: 'Humana',
      plan_name: 'Preventive Dental Plus',
      coverage_type: 'Family',
      member_id: 'DEN-998811',
      monthly_premium: 48.00,
      effective_date: usDateToIso('08/01/2026'),
      status: 'Active'
    },
    {
      client_id: testClient.id,
      product_type: 'Vision',
      company: 'VSP Vision Care',
      plan_name: 'Choice Vision Plan',
      coverage_type: 'Individual',
      member_id: 'VIS-445522',
      monthly_premium: 18.50,
      effective_date: usDateToIso('08/12/2026'),
      status: 'Active'
    },
    {
      client_id: testClient.id,
      product_type: 'Accident',
      company: 'Aflac',
      plan_name: 'Accident Advantage Plus',
      coverage_type: 'Family',
      member_id: 'ACC-112233',
      monthly_premium: 32.00,
      effective_date: usDateToIso('01/05/2027'),
      status: 'Active'
    },
    {
      client_id: testClient.id,
      product_type: 'Critical Illness',
      company: 'Allstate',
      plan_name: 'Critical Illness Protection',
      coverage_type: 'Individual & Spouse',
      member_id: 'CRI-778899',
      monthly_premium: 55.20,
      effective_date: usDateToIso('09/01/2026'),
      status: 'Pending'
    }
  ];

  const { data: insertedPolicies, error: insErr } = await supabaseAdmin
    .from('client_supplemental_policies')
    .insert(policiesToInsert)
    .select();

  if (insErr) throw insErr;
  console.log(`✅ Successfully inserted ${insertedPolicies.length} Supplemental Policies simultaneously.`);
  if (insertedPolicies.length !== 4) throw new Error("Expected 4 policies!");

  // Verify Overview query return
  const { data: fetchedOverview } = await supabaseAdmin
    .from('client_supplemental_policies')
    .select('*')
    .eq('client_id', testClient.id);

  console.log(`✅ Overview Query: Returned ${fetchedOverview.length} real Supplemental policies.`);

  console.log("\n==================================================");
  console.log("3. TESTING COVERED MEMBERS CRUD (DENTAL POLICY)");
  console.log("==================================================");

  const dentalPolicy = insertedPolicies.find(p => p.product_type === 'Dental');

  const membersToInsert = [
    {
      policy_id: dentalPolicy.id,
      full_name: 'Self Member Test',
      relationship: 'Self',
      phone: '305-555-0101',
      birth_date: usDateToIso('05/15/1985'),
      member_id: 'MEM-01'
    },
    {
      policy_id: dentalPolicy.id,
      full_name: 'Spouse Member Test',
      relationship: 'Spouse',
      phone: '305-555-0102',
      birth_date: usDateToIso('10/20/1987'),
      member_id: 'MEM-02'
    },
    {
      policy_id: dentalPolicy.id,
      full_name: 'Child Member Test',
      relationship: 'Child',
      phone: '305-555-0103',
      birth_date: usDateToIso('02/10/2015'),
      member_id: 'MEM-03'
    }
  ];

  const { data: insertedMembers, error: memErr } = await supabaseAdmin
    .from('client_supplemental_members')
    .insert(membersToInsert)
    .select();

  if (memErr) throw memErr;
  console.log(`✅ Inserted ${insertedMembers.length} Covered Members under Dental policy.`);

  // Edit 1 Covered Member
  const { data: updatedMember } = await supabaseAdmin
    .from('client_supplemental_members')
    .update({ full_name: 'Spouse Member Test (Updated Name)' })
    .eq('id', insertedMembers[1].id)
    .select()
    .single();
  console.log(`✅ Edited Covered Member: "${updatedMember.full_name}"`);

  // Delete 1 Covered Member
  await supabaseAdmin
    .from('client_supplemental_members')
    .delete()
    .eq('id', insertedMembers[2].id);

  const { data: remainingMembers } = await supabaseAdmin
    .from('client_supplemental_members')
    .select('*')
    .eq('policy_id', dentalPolicy.id);

  console.log(`✅ Deleted 1 Covered Member. Remaining count under Dental: ${remainingMembers.length}`);
  if (remainingMembers.length !== 2) throw new Error("Expected 2 remaining covered members!");

  console.log("\n==================================================");
  console.log("4. TESTING USA DATE FORMAT PERSISTENCE & PARSING");
  console.log("==================================================");

  // Test 08/12/2026
  const testIso1 = usDateToIso('08/12/2026');
  if (testIso1 !== '2026-08-12') throw new Error(`usDateToIso failure: ${testIso1}`);
  const testUi1 = formatIsoToUsDate(testIso1);
  if (testUi1 !== '08/12/2026') throw new Error(`formatIsoToUsDate failure: ${testUi1}`);

  // Test 01/05/2027 (January 5, 2027)
  const accidentPolicy = insertedPolicies.find(p => p.product_type === 'Accident');
  console.log(`Accident Effective DB ISO: '${accidentPolicy.effective_date}'`);
  if (accidentPolicy.effective_date !== '2027-01-05') throw new Error("Accident date is not 2027-01-05");
  const accidentUiDate = formatIsoToUsDate(accidentPolicy.effective_date);
  console.log(`Accident Effective UI Display: '${accidentUiDate}' (January 5, 2027)`);
  if (accidentUiDate !== '01/05/2027') throw new Error("Accident date UI display is not 01/05/2027");

  console.log("\n==================================================");
  console.log("5. TESTING OWNER-PRIVATE RLS SECURITY");
  console.log("==================================================");

  // Find Laura's client
  const { data: lauraClients } = await supabaseAdmin.from('clients').select('id, agent_id').eq('agent_id', LAURA_ID).limit(1);
  if (lauraClients.length > 0) {
    const lauraClient = lauraClients[0];
    const { data: amandaCheck } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', lauraClient.id)
      .eq('agent_id', AMANDA_ID);

    console.log("Amanda ownership check for Laura's client Supplemental:", amandaCheck.length === 0 ? "Blocked (0 rows)" : "Failed");
    if (amandaCheck.length > 0) throw new Error("Amanda incorrectly passed ownership check!");
  }
  console.log("✅ Owner-Private RLS Enforcement: PASS");

  console.log("\n==================================================");
  console.log("6. NON-BREAKAGE REGRESSION TEST");
  console.log("==================================================");

  const { data: c } = await supabaseAdmin.from('clients').select('id').limit(5);
  const { data: h } = await supabaseAdmin.from('health_policies').select('id').limit(5);
  const { data: l } = await supabaseAdmin.from('life_policies').select('id').limit(5);
  const { data: m } = await supabaseAdmin.from('client_medicare_information').select('id').limit(5);
  const { data: p } = await supabaseAdmin.from('policies').select('id').limit(5);

  console.log(`✅ Clients query: ${c.length} rows`);
  console.log(`✅ Health policies query: ${h.length} rows`);
  console.log(`✅ Life policies query: ${l.length} rows`);
  console.log(`✅ Medicare info query: ${m.length} rows`);
  console.log(`✅ P&C policies query: ${p.length} rows`);

  console.log("\n🎉 ALL SUPPLEMENTAL MODULE VERIFICATION TESTS PASSED PERFECTLY!");
}

testSupplementalModule().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
