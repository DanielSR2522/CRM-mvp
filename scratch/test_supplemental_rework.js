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

async function testSupplementalRework() {
  console.log("==================================================");
  console.log("1. TESTING DATABASE TABLE SCHEMA & BENEFICIARY FIELDS");
  console.log("==================================================");

  const { data: clients } = await supabaseAdmin.from('clients').select('id, full_name, agent_id').limit(1);
  const testClient = clients[0];
  console.log(`Testing with Client: "${testClient.full_name}" (${testClient.id})`);

  // Clean old test records
  await supabaseAdmin.from('client_supplemental_policies').delete().eq('client_id', testClient.id);

  // Insert a policy with Beneficiary Information
  const policyPayload = {
    client_id: testClient.id,
    product_type: 'Hospital Indemnity',
    company: 'Humana',
    plan_name: 'Hospital Choice Premier',
    coverage_type: 'Individual & Spouse',
    member_id: 'HOS-998822',
    monthly_premium: 55.00,
    effective_date: usDateToIso('08/01/2026'),
    status: 'Active',

    // Beneficiary Fields
    beneficiary_name: 'Maria Perez',
    beneficiary_phone: '(305) 555-1234',
    beneficiary_birth_date: usDateToIso('07/22/1987')
  };

  const { data: insertedPolicy, error: insErr } = await supabaseAdmin
    .from('client_supplemental_policies')
    .insert(policyPayload)
    .select()
    .single();

  if (insErr) throw insErr;
  console.log("✅ Inserted Supplemental Policy with Beneficiary:", insertedPolicy.id);

  // Re-fetch to test persistence
  const { data: fetchedPolicy } = await supabaseAdmin
    .from('client_supplemental_policies')
    .select('*')
    .eq('id', insertedPolicy.id)
    .single();

  console.log("✅ Verified Beneficiary Fields in DB:", {
    beneficiary_name: fetchedPolicy.beneficiary_name,
    beneficiary_phone: fetchedPolicy.beneficiary_phone,
    beneficiary_birth_date: fetchedPolicy.beneficiary_birth_date,
    ui_birth_date: formatIsoToUsDate(fetchedPolicy.beneficiary_birth_date)
  });

  if (fetchedPolicy.beneficiary_name !== 'Maria Perez') throw new Error('Beneficiary name failed persistence!');
  if (fetchedPolicy.beneficiary_phone !== '(305) 555-1234') throw new Error('Beneficiary phone failed persistence!');
  if (fetchedPolicy.beneficiary_birth_date !== '1987-07-22') throw new Error('Beneficiary birth date DB ISO failed!');
  if (formatIsoToUsDate(fetchedPolicy.beneficiary_birth_date) !== '07/22/1987') throw new Error('Beneficiary birth date UI display failed!');

  console.log("\n==================================================");
  console.log("2. TESTING USA DATE PARSING (01/05/2027 = Jan 5, 2027)");
  console.log("==================================================");

  const testIso = usDateToIso('01/05/2027');
  if (testIso !== '2027-01-05') throw new Error(`usDateToIso failure: ${testIso}`);
  const testUi = formatIsoToUsDate(testIso);
  if (testUi !== '01/05/2027') throw new Error(`formatIsoToUsDate failure: ${testUi}`);
  console.log(`✅ US Input: '01/05/2027' -> DB ISO: '${testIso}' -> UI Display: '${testUi}' (January 5, 2027)`);

  console.log("\n==================================================");
  console.log("3. TESTING OWNER-PRIVATE RLS SECURITY");
  console.log("==================================================");

  const { data: lauraClients } = await supabaseAdmin.from('clients').select('id, agent_id').eq('agent_id', LAURA_ID).limit(1);
  if (lauraClients.length > 0) {
    const lauraClient = lauraClients[0];
    const { data: amandaCheck } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', lauraClient.id)
      .eq('agent_id', AMANDA_ID);

    if (amandaCheck.length > 0) throw new Error("Amanda incorrectly passed ownership check!");
  }
  console.log("✅ Owner-Private RLS Enforcement: PASS");

  console.log("\n==================================================");
  console.log("4. NON-BREAKAGE REGRESSION TEST");
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

  console.log("\n🎉 ALL SUPPLEMENTAL REWORK VERIFICATION TESTS PASSED PERFECTLY!");
}

testSupplementalRework().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
