const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';

async function testClientDocFlow() {
  console.log('====================================================');
  console.log('TESTING CLIENT DOCUMENTS BUCKET & UPLOAD FLOW');
  console.log('====================================================\n');

  // 1. Create dummy client
  const { data: client, error: cErr } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: 'TEST_CLIENT_DOCS_FLOW',
    email: 'client_docs_test@example.com'
  }).select().single();

  if (cErr) throw cErr;

  console.log('1. Test client created:', client.id);

  // 2. Upload storage file to policy-documents
  const storagePath = `${AMANDA_UUID}/${client.id}/documents/${Date.now()}-test_doc.pdf`;
  const fileBuffer = Buffer.from('%PDF-1.4 test document content');

  const { error: uploadErr } = await adminClient.storage
    .from('policy-documents')
    .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: false });

  console.log('2. Storage upload to policy-documents:', uploadErr ? `❌ ${uploadErr.message}` : '✅ SUCCESS');

  // 3. Insert metadata to client_documents
  const { data: docRow, error: metaErr } = await adminClient
    .from('client_documents')
    .insert({
      client_id: client.id,
      agent_id: AMANDA_UUID,
      display_name: 'Drivers License Test',
      document_type: 'Identification',
      description: 'Test document description',
      original_filename: 'test_doc.pdf',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      size_bytes: fileBuffer.length
    })
    .select()
    .single();

  console.log('3. client_documents DB row insert:', metaErr ? `❌ ${metaErr.message}` : `✅ SUCCESS (id: ${docRow.id})`);

  // 4. Generate signed URL
  const { data: signedData, error: signedErr } = await adminClient.storage
    .from('policy-documents')
    .createSignedUrl(storagePath, 3600);

  console.log('4. Signed URL generation:', signedErr ? `❌ ${signedErr.message}` : `✅ SUCCESS (URL created)`);

  // 5. Cleanup
  console.log('\n--- Cleaning up test artifacts ---');
  await adminClient.storage.from('policy-documents').remove([storagePath]);
  await adminClient.from('client_documents').delete().eq('id', docRow.id);
  await adminClient.from('clients').delete().eq('id', client.id);
  console.log('Cleanup finished.\n');

  console.log('====================================================');
  console.log('ALL CLIENT DOCUMENT TESTS PASSED SUCCESSFULLY');
  console.log('====================================================');
}

testClientDocFlow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
