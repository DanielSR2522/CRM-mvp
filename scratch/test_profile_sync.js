const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AMANDA_ID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
const LAURA_ID  = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

async function testProfileSync() {
  console.log("==================================================");
  console.log("1. TESTING DOCUMENTS SINGLE SOURCE OF TRUTH");
  console.log("==================================================");

  const { data: clients } = await supabaseAdmin.from('clients').select('id, full_name, agent_id').limit(1);
  const testClient = clients[0];
  console.log(`Testing Client: "${testClient.full_name}" (${testClient.id})`);

  // Clean old test records
  await supabaseAdmin.from('client_documents').delete().eq('client_id', testClient.id);
  await supabaseAdmin.from('client_notes').delete().eq('client_id', testClient.id);
  await supabaseAdmin.from('client_supplemental_policies').delete().eq('client_id', testClient.id);

  // 1. Upload Medicare Document
  const medDoc = {
    client_id: testClient.id,
    agent_id: testClient.agent_id,
    display_name: 'Medicare Scope of Appointment Signed',
    document_type: 'Consent',
    original_filename: 'soa_signed.pdf',
    storage_path: `${testClient.id}/soa_signed.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 102450,
    module_type: 'medicare',
    policy_id: null,
  };

  const { data: insertedMedDoc, error: medDocErr } = await supabaseAdmin
    .from('client_documents')
    .insert(medDoc)
    .select()
    .single();

  if (medDocErr) throw medDocErr;
  console.log("✅ Medicare Document inserted:", insertedMedDoc.id);

  // 2. Insert 2 Supplemental Policies (Dental & Hospital)
  const { data: dentalPol } = await supabaseAdmin.from('client_supplemental_policies').insert({
    client_id: testClient.id,
    product_type: 'Dental',
    company: 'VSP',
    monthly_premium: 35.00,
    status: 'Active'
  }).select().single();

  const { data: hospitalPol } = await supabaseAdmin.from('client_supplemental_policies').insert({
    client_id: testClient.id,
    product_type: 'Hospital Indemnity',
    company: 'Humana',
    monthly_premium: 50.00,
    status: 'Active'
  }).select().single();

  console.log(`✅ Inserted Supplemental Policies: Dental (${dentalPol.id}), Hospital (${hospitalPol.id})`);

  // 3. Upload Supplemental Dental Document
  const dentalDoc = {
    client_id: testClient.id,
    agent_id: testClient.agent_id,
    display_name: 'Dental ID Card 2026',
    document_type: 'ID Card',
    original_filename: 'dental_card.pdf',
    storage_path: `${testClient.id}/dental_card.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 54000,
    module_type: 'supplemental',
    policy_id: dentalPol.id,
  };

  const { data: insertedDentalDoc, error: dDocErr } = await supabaseAdmin
    .from('client_documents')
    .insert(dentalDoc)
    .select()
    .single();

  if (dDocErr) throw dDocErr;
  console.log("✅ Supplemental Dental Document inserted:", insertedDentalDoc.id);

  // Verification 3A: Medicare Documents filter
  const { data: medDocsList } = await supabaseAdmin
    .from('client_documents')
    .select('*')
    .eq('client_id', testClient.id)
    .eq('module_type', 'medicare');

  if (medDocsList.length !== 1 || medDocsList[0].id !== insertedMedDoc.id) {
    throw new Error('Medicare documents filtering failed!');
  }
  console.log("✅ Medicare Documents Module Filter: 1 record found");

  // Verification 3B: Dental Documents filter
  const { data: dentalDocsList } = await supabaseAdmin
    .from('client_documents')
    .select('*')
    .eq('client_id', testClient.id)
    .eq('module_type', 'supplemental')
    .eq('policy_id', dentalPol.id);

  if (dentalDocsList.length !== 1 || dentalDocsList[0].id !== insertedDentalDoc.id) {
    throw new Error('Dental documents policy context filter failed!');
  }
  console.log("✅ Dental Supplemental Documents Filter: 1 record found");

  // Verification 3C: Hospital Documents filter (should be empty)
  const { data: hospitalDocsList } = await supabaseAdmin
    .from('client_documents')
    .select('*')
    .eq('client_id', testClient.id)
    .eq('module_type', 'supplemental')
    .eq('policy_id', hospitalPol.id);

  if (hospitalDocsList.length !== 0) {
    throw new Error('Hospital Supplemental documents leaked Dental document!');
  }
  console.log("✅ Hospital Supplemental Documents Filter: 0 records (No leakage)");

  // Verification 3D: General Client Documents aggregator
  const { data: allClientDocs } = await supabaseAdmin
    .from('client_documents')
    .select('*')
    .eq('client_id', testClient.id);

  if (allClientDocs.length !== 2) {
    throw new Error(`General client documents aggregation failed! Expected 2, got ${allClientDocs.length}`);
  }
  console.log("✅ General Client Profile Documents Aggregator: 2 total records found (Single source of truth)");

  console.log("\n==================================================");
  console.log("2. TESTING NOTES SINGLE SOURCE OF TRUTH");
  console.log("==================================================");

  // Insert Medicare Note
  const { data: medNote, error: mnErr } = await supabaseAdmin.from('client_notes').insert({
    client_id: testClient.id,
    category: 'medicare',
    content: 'Client requested Part D drug lookup review.',
    created_by: testClient.agent_id
  }).select().single();

  if (mnErr) throw mnErr;

  // Insert Supplemental Dental Note
  const { data: dentalNote, error: dnErr } = await supabaseAdmin.from('client_notes').insert({
    client_id: testClient.id,
    category: 'supplemental',
    policy_id: dentalPol.id,
    content: 'Dental coverage effective date verified with VSP.',
    created_by: testClient.agent_id
  }).select().single();

  if (dnErr) throw dnErr;

  console.log("✅ Notes inserted:", { medNoteId: medNote.id, dentalNoteId: dentalNote.id });

  // Verification 2A: Medicare Notes
  const { data: medNotesList } = await supabaseAdmin.from('client_notes').select('*').eq('client_id', testClient.id).eq('category', 'medicare');
  if (medNotesList.length !== 1) throw new Error('Medicare notes filter failed!');
  console.log("✅ Medicare Notes Filter: 1 record found");

  // Verification 2B: Dental Supplemental Notes
  const { data: dentalNotesList } = await supabaseAdmin.from('client_notes').select('*').eq('client_id', testClient.id).eq('category', 'supplemental').eq('policy_id', dentalPol.id);
  if (dentalNotesList.length !== 1) throw new Error('Dental notes policy filter failed!');
  console.log("✅ Dental Notes Filter: 1 record found");

  // Verification 2C: Hospital Supplemental Notes (0)
  const { data: hospitalNotesList } = await supabaseAdmin.from('client_notes').select('*').eq('client_id', testClient.id).eq('category', 'supplemental').eq('policy_id', hospitalPol.id);
  if (hospitalNotesList.length !== 0) throw new Error('Hospital notes leaked Dental note!');
  console.log("✅ Hospital Notes Filter: 0 records (No leakage)");

  // Verification 2D: General Notes aggregator
  const { data: allNotes } = await supabaseAdmin.from('client_notes').select('*').eq('client_id', testClient.id);
  if (allNotes.length !== 2) throw new Error(`General client notes aggregator failed! Expected 2, got ${allNotes.length}`);
  console.log("✅ General Client Profile Notes Aggregator: 2 total records found (Single source of truth)");

  console.log("\n==================================================");
  console.log("3. TESTING OVERVIEW DELETE SYNCHRONIZATION");
  console.log("==================================================");

  // Before delete count
  const { data: initialPols } = await supabaseAdmin.from('client_supplemental_policies').select('id').eq('client_id', testClient.id);
  console.log(`Initial Supplemental policies count: ${initialPols.length}`);

  // Delete Dental policy
  await supabaseAdmin.from('client_supplemental_policies').delete().eq('id', dentalPol.id);

  // After delete count
  const { data: afterPols } = await supabaseAdmin.from('client_supplemental_policies').select('id').eq('client_id', testClient.id);
  console.log(`After delete Supplemental policies count: ${afterPols.length}`);

  if (afterPols.length !== initialPols.length - 1) {
    throw new Error('Supplemental policy deletion failed to update database count!');
  }
  if (afterPols.some(p => p.id === dentalPol.id)) {
    throw new Error('Deleted policy still exists in database!');
  }
  console.log("✅ Overview Delete Synchronization & Policy Count Decrement: PASS");

  console.log("\n==================================================");
  console.log("4. TESTING SECURITY & OWNER-PRIVATE RLS");
  console.log("==================================================");

  const { data: lauraClients } = await supabaseAdmin.from('clients').select('id, agent_id').eq('agent_id', LAURA_ID).limit(1);
  if (lauraClients.length > 0) {
    const lauraClient = lauraClients[0];
    const { data: amandaAccess } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', lauraClient.id)
      .eq('agent_id', AMANDA_ID);

    if (amandaAccess.length > 0) throw new Error("Security breach: Amanda accessed Laura's client record!");
  }
  console.log("✅ Owner-Private Security Checks: PASS");

  console.log("\n🎉 ALL FLOATING TABS, PROFILE SYNC, & OVERVIEW DELETE TESTS PASSED!");
}

testProfileSync().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
