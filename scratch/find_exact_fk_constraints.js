const fs = require('fs');
const path = require('path');

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

const { getSupabaseAdmin } = require('../src/lib/supabaseAdmin');

async function testDeleteSignatureRequest() {
  const supabase = getSupabaseAdmin();
  
  // 1. Get signature requests
  const { data: sigReqs } = await supabase
    .from('signature_requests')
    .select('id, client_id, status')
    .limit(5);

  console.log('Signature requests in DB:', sigReqs);

  if (sigReqs && sigReqs.length > 0) {
    const testSig = sigReqs[0];
    console.log('\n--- Attempting to delete signature_request ID:', testSig.id, '---');
    const { error: sigErr } = await supabase
      .from('signature_requests')
      .delete()
      .eq('id', testSig.id);

    if (sigErr) {
      console.log('EXACT SIG REQUEST DELETE ERROR:');
      console.log('Code:', sigErr.code);
      console.log('Message:', sigErr.message);
      console.log('Details:', sigErr.details);
      console.log('Hint:', sigErr.hint);
    } else {
      console.log('Successfully deleted signature request without error!');
    }
  }

  // 2. Also test querying all child tables of signature_requests
  console.log('\n--- Checking child tables for signature_requests ---');
  if (sigReqs && sigReqs.length > 0) {
    const reqId = sigReqs[0].id;
    const childTables = [
      { name: 'signature_files', col: 'request_id' },
      { name: 'signature_request_recipients', col: 'request_id' },
      { name: 'signature_request_events', col: 'request_id' },
      { name: 'signed_documents', col: 'request_id' },
      { name: 'consent_signatures', col: 'request_id' },
      { name: 'consent_request_audits', col: 'request_id' }
    ];

    for (const t of childTables) {
      const { data, error } = await supabase.from(t.name).select('*').eq(t.col, reqId);
      if (error) {
        console.log(`Child table ${t.name}: Error (${error.message})`);
      } else {
        console.log(`Child table ${t.name}: ${data.length} rows referencing request_id ${reqId}`);
      }
    }
  }
}

testDeleteSignatureRequest();
