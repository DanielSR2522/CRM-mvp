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

async function testEndToEndSupplemental() {
  console.log('--- Testing End-to-End Supplemental Upload Flow with crm-documents bucket ---');

  // 1. Get client & agent_id
  const { data: clients } = await supabase.from('clients').select('id, agent_id').limit(1);
  const client = clients[0];
  console.log('Client ID:', client.id, 'Agent ID:', client.agent_id);

  // 2. Simulate Upload to Storage & DB
  const fileName = `test_supp_${Date.now()}.pdf`;
  const storagePath = `${client.id}/${Date.now()}_test_supp.pdf`;
  const dummyBuffer = Buffer.from('%PDF-1.4 test content');

  // Storage Upload to 'crm-documents'
  const { data: storageRes, error: storageErr } = await supabase.storage
    .from('crm-documents')
    .upload(storagePath, dummyBuffer, { contentType: 'application/pdf' });

  if (storageErr) {
    console.error('Storage Upload Error:', storageErr);
    return;
  }
  console.log('Storage Upload SUCCESS:', storageRes);

  // DB Insert
  const docPayload = {
    client_id: client.id,
    agent_id: client.agent_id,
    display_name: 'Supplemental Test Form',
    document_type: 'Application',
    original_filename: fileName,
    storage_path: storagePath,
    mime_type: 'application/pdf',
    size_bytes: dummyBuffer.length,
    module_type: 'supplemental',
    policy_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: dbRes, error: dbErr } = await supabase
    .from('client_documents')
    .insert(docPayload)
    .select('*');

  if (dbErr) {
    console.error('DB Insert Error:', dbErr);
    await supabase.storage.from('crm-documents').remove([storagePath]);
    return;
  }
  console.log('DB Insert SUCCESS:', dbRes[0]);

  // 3. Test Signed URL generation for View / Download
  const { data: signedUrlData, error: signedUrlErr } = await supabase.storage
    .from('crm-documents')
    .createSignedUrl(storagePath, 60);

  if (signedUrlErr) {
    console.error('Signed URL Error:', signedUrlErr);
  } else {
    console.log('Signed URL Generated SUCCESS:', signedUrlData.signedUrl);
  }

  // 4. Query Supplemental Documents
  const { data: suppDocs, error: queryErr } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', client.id)
    .eq('module_type', 'supplemental');

  console.log('Query Supplemental Docs SUCCESS:', queryErr ? queryErr : `Found ${suppDocs.length} docs`);

  // 5. Query Unified Documents (as done in src/app/clients/[id]/page.tsx)
  const { data: genDocs } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', client.id);

  const unifiedDocs = (genDocs || []).map((d) => {
    const modType = (d.module_type || 'general').toLowerCase();
    const sourceLabelMap = {
      supplemental: 'Supplemental',
      medicare: 'Medicare',
      health: 'Health',
      life: 'Life',
      property_casualty: 'Property & Casualty',
      general: 'General',
    };
    return {
      id: d.id,
      sourceLabel: sourceLabelMap[modType] || 'General',
      displayName: d.display_name,
      storagePath: d.storage_path,
    };
  });

  const suppUnified = unifiedDocs.filter(d => d.sourceLabel === 'Supplemental');
  console.log('Unified Docs mapped to Supplemental SUCCESS:', suppUnified);

  // Clean up test data
  await supabase.storage.from('crm-documents').remove([storagePath]);
  await supabase.from('client_documents').delete().eq('id', dbRes[0].id);
  console.log('Cleaned up test storage & DB records.');
}

testEndToEndSupplemental();
