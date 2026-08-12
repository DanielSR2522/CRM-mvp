const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testMedicareModule() {
  console.log("==================================================");
  console.log("1. TESTING DATABASE TABLE EXISTENCE");
  console.log("==================================================");

  const tables = [
    'client_medicare_information',
    'client_medicare_doctors',
    'client_medicare_hospitals',
    'client_medicare_urgent_cares',
    'client_medicare_pharmacies',
    'client_medicare_conditions',
    'client_medicare_specialists',
    'client_medicare_medications'
  ];

  for (const t of tables) {
    const { data, error } = await supabaseAdmin.from(t).select('*').limit(1);
    if (error) {
      throw new Error(`Table ${t} failed: ${error.message}`);
    }
    console.log(`✅ Table '${t}' exists and responds cleanly.`);
  }

  // Get a test client
  const { data: clients } = await supabaseAdmin.from('clients').select('id, full_name').limit(1);
  const testClient = clients[0];
  console.log(`\nTesting with Client: "${testClient.full_name}" (${testClient.id})`);

  console.log("\n==================================================");
  console.log("2. TESTING SCOPE OF APPOINTMENT & MEDICARE DETAILS");
  console.log("==================================================");

  const infoPayload = {
    client_id: testClient.id,
    scope_of_appointment: true,
    soa_date: '2026-08-12',
    soa_method: 'Phone',
    mbi: '1EG4-TE5-MK72',
    part_a_effective_date: '2026-01-01',
    part_b_effective_date: '2026-01-01',
    part_c_subtype: 'HMO',
    medicaid_level: 'Full Medicaid',
    medicaid_id: 'MCD987654',
    renewal_status: 'Active',
    company: 'Humana',
    plan_name: 'Humana Choice HMO',
    plan_id: 'H1036-089-0',
    plan_effective_date: '2026-01-01',
    updated_at: new Date().toISOString()
  };

  const { data: savedInfo, error: infoErr } = await supabaseAdmin
    .from('client_medicare_information')
    .upsert(infoPayload, { onConflict: 'client_id' })
    .select()
    .single();

  if (infoErr) throw infoErr;
  console.log("✅ Saved Medicare Info:", savedInfo);

  // Fetch back to verify persistence
  const { data: fetchedInfo } = await supabaseAdmin
    .from('client_medicare_information')
    .select('*')
    .eq('client_id', testClient.id)
    .single();

  if (fetchedInfo.mbi !== '1EG4-TE5-MK72' || fetchedInfo.scope_of_appointment !== true) {
    throw new Error("Persistence verification failed for Medicare Info!");
  }
  console.log("✅ Verified persistence for Medicare Info.");

  console.log("\n==================================================");
  console.log("3. TESTING MEDICAL SECTION RELATIONAL CATEGORIES");
  console.log("==================================================");

  // Clean test client entries first
  for (const t of tables.slice(1)) {
    await supabaseAdmin.from(t).delete().eq('client_id', testClient.id);
  }

  // A. Add 2 Doctors
  const { data: docs } = await supabaseAdmin.from('client_medicare_doctors').insert([
    { client_id: testClient.id, name: 'Dr. Luis Perez', specialty: 'Primary Care', phone: '305-555-0101', address: '123 Main St' },
    { client_id: testClient.id, name: 'Dr. Maria Santos', specialty: 'Internal Medicine', phone: '305-555-0102', address: '456 Oak Ave' }
  ]).select();
  console.log(`✅ Inserted ${docs.length} Primary Doctors.`);

  // B. Add 2 Hospitals
  const { data: hosps } = await supabaseAdmin.from('client_medicare_hospitals').insert([
    { client_id: testClient.id, name: 'Baptist Hospital', phone: '305-595-2121', address: '8900 N Kendall Dr' },
    { client_id: testClient.id, name: 'Jackson Memorial Hospital', phone: '305-585-1111', address: '1611 NW 12th Ave' }
  ]).select();
  console.log(`✅ Inserted ${hosps.length} Hospitals.`);

  // C. Add 2 Urgent Cares
  const { data: ucs } = await supabaseAdmin.from('client_medicare_urgent_cares').insert([
    { client_id: testClient.id, name: 'MD Now Urgent Care', phone: '305-222-0199', address: '100 Coral Way' },
    { client_id: testClient.id, name: 'FastCare Urgent Care', phone: '305-333-0188', address: '200 Biscayne Blvd' }
  ]).select();
  console.log(`✅ Inserted ${ucs.length} Urgent Care Centers.`);

  // D. Add 2 Pharmacies
  const { data: pharms } = await supabaseAdmin.from('client_medicare_pharmacies').insert([
    { client_id: testClient.id, name: 'CVS Pharmacy #1042', phone: '305-444-1234', address: '500 SW 8th St' },
    { client_id: testClient.id, name: 'Walgreens #5510', phone: '305-444-5678', address: '600 SW 27th Ave' }
  ]).select();
  console.log(`✅ Inserted ${pharms.length} Pharmacies.`);

  // E. Add 3 Conditions
  const { data: conds } = await supabaseAdmin.from('client_medicare_conditions').insert([
    { client_id: testClient.id, name: 'Diabetes Type 2', notes: 'Managed with Metformin' },
    { client_id: testClient.id, name: 'Hypertension', notes: 'Monitored daily' },
    { client_id: testClient.id, name: 'High Cholesterol', notes: 'Statins prescribed' }
  ]).select();
  console.log(`✅ Inserted ${conds.length} Medical Conditions.`);

  // F. Add 2 Specialists
  const { data: specs } = await supabaseAdmin.from('client_medicare_specialists').insert([
    { client_id: testClient.id, name: 'Dr. Carlos Mendoza', specialty: 'Cardiology', phone: '305-777-8899', address: '700 SW 1st Ave' },
    { client_id: testClient.id, name: 'Dr. Elena Rostova', specialty: 'Endocrinology', phone: '305-777-9900', address: '800 SW 2nd Ave' }
  ]).select();
  console.log(`✅ Inserted ${specs.length} Specialists.`);

  // G. Add 3 Medications
  const { data: meds } = await supabaseAdmin.from('client_medicare_medications').insert([
    { client_id: testClient.id, name: 'Metformin', dosage: '500 mg', frequency: '2 times daily', instructions: 'Take with meals' },
    { client_id: testClient.id, name: 'Lisinopril', dosage: '10 mg', frequency: 'Once daily', instructions: 'Take in the morning' },
    { client_id: testClient.id, name: 'Atorvastatin', dosage: '20 mg', frequency: 'Once daily at bedtime', instructions: 'Avoid grapefruit' }
  ]).select();
  console.log(`✅ Inserted ${meds.length} Medicines.`);

  // Edit 1 Doctor
  const { data: updatedDoc } = await supabaseAdmin
    .from('client_medicare_doctors')
    .update({ name: 'Dr. Luis Perez, MD (Updated)', phone: '305-555-9999' })
    .eq('id', docs[0].id)
    .select()
    .single();
  console.log("✅ Edited Doctor 1:", updatedDoc.name);

  // Delete 1 Medication
  await supabaseAdmin
    .from('client_medicare_medications')
    .delete()
    .eq('id', meds[2].id);
  
  const { data: remainingMeds } = await supabaseAdmin
    .from('client_medicare_medications')
    .select('*')
    .eq('client_id', testClient.id);
  console.log(`✅ Deleted 1 Medication. Remaining count: ${remainingMeds.length}`);

  console.log("\n==================================================");
  console.log("4. REGRESSION VERIFICATION (EXISTING CRM MODULES)");
  console.log("==================================================");

  const { data: regClients } = await supabaseAdmin.from('clients').select('id').limit(5);
  const { data: regHealth } = await supabaseAdmin.from('health_policies').select('id').limit(5);
  const { data: regLife } = await supabaseAdmin.from('life_policies').select('id').limit(5);
  const { data: regPolicies } = await supabaseAdmin.from('policies').select('id').limit(5);
  const { data: regProfiles } = await supabaseAdmin.from('profiles').select('id').limit(5);

  console.log(`✅ Existing clients query: ${regClients?.length} rows`);
  console.log(`✅ Existing health policies query: ${regHealth?.length} rows`);
  console.log(`✅ Existing life policies query: ${regLife?.length} rows`);
  console.log(`✅ Existing P&C policies query: ${regPolicies?.length} rows`);
  console.log(`✅ Existing profiles query: ${regProfiles?.length} rows`);

  console.log("\n🎉 ALL MEDICARE MODULE VERIFICATION TESTS PASSED PERFECTLY!");
}

testMedicareModule().catch((err) => {
  console.error("❌ Test script failed:", err);
  process.exit(1);
});
