const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupplementalUpload() {
  console.log('--- Testing Supplemental Document Upload & Database Integration ---');

  // 1. Fetch a client
  const { data: clients, error: clientErr } = await supabase.from('clients').select('id, full_name').limit(1);
  if (clientErr || !clients || clients.length === 0) {
    console.error('Error fetching client:', clientErr);
    return;
  }
  const testClient = clients[0];
  console.log('Test Client:', testClient);

  // 2. Fetch a supplemental policy if any
  const { data: suppPolicies, error: suppErr } = await supabase
    .from('client_supplemental_policies')
    .select('id, product_type')
    .eq('client_id', testClient.id)
    .limit(1);

  const policyId = suppPolicies && suppPolicies.length > 0 ? suppPolicies[0].id : null;
  console.log('Test Policy ID:', policyId);

  // 3. Test insert into client_documents
  const testStoragePath = `${testClient.id}/test_supp_${Date.now()}.pdf`;
  const docPayload = {
    client_id: testClient.id,
    display_name: 'Test Supplemental Document',
    document_type: 'Application',
    original_filename: 'test_supp.pdf',
    storage_path: testStoragePath,
    mime_type: 'application/pdf',
    size_bytes: 1024,
    module_type: 'supplemental',
    policy_id: policyId,
    bucket: 'client-documents',
  };

  console.log('Inserting docPayload:', docPayload);
  const { data: inserted, error: dbErr } = await supabase
    .from('client_documents')
    .insert(docPayload)
    .select('*');

  if (dbErr) {
    console.error('DATABASE INSERT ERROR:', dbErr);
  } else {
    console.log('DATABASE INSERT SUCCESS:', inserted);
    // Cleanup test record
    await supabase.from('client_documents').delete().eq('id', inserted[0].id);
    console.log('Cleaned up test inserted record.');
  }

  // 4. Test querying client_documents with module_type = 'supplemental'
  const { data: suppDocs, error: queryErr } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', testClient.id)
    .eq('module_type', 'supplemental');

  if (queryErr) {
    console.error('QUERY ERROR:', queryErr);
  } else {
    console.log('Existing supplemental docs count for client:', suppDocs ? suppDocs.length : 0);
  }
}

testSupplementalUpload();
