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

async function testSignedDeleteAndTriggers() {
  const supabase = getSupabaseAdmin();
  
  // 1. Try deleting a 'signed' signature request (ID: 5b731c2c-954a-478a-aeae-83314b626799)
  console.log('--- Attempting to delete SIGNED signature_request 5b731c2c-954a-478a-aeae-83314b626799 ---');
  const { error: signedErr } = await supabase
    .from('signature_requests')
    .delete()
    .eq('id', '5b731c2c-954a-478a-aeae-83314b626799');

  if (signedErr) {
    console.log('SIGNED SIG REQUEST DELETE ERROR:');
    console.log('Code:', signedErr.code);
    console.log('Message:', signedErr.message);
    console.log('Details:', signedErr.details);
    console.log('Hint:', signedErr.hint);
  } else {
    console.log('Successfully deleted SIGNED signature request!');
  }

  // 2. Also check if signature_files has FK constraints on signature_requests
  console.log('\n--- Checking signature_files table ---');
  const { data: sigFiles, error: filesErr } = await supabase.from('signature_files').select('*');
  console.log('Signature files count:', sigFiles ? sigFiles.length : 0, filesErr ? filesErr.message : '');

  // 3. Also check if client deletion fails for a client with signature_requests
  console.log('\n--- Testing client delete for client with signature requests ---');
  // Client d430c61b-6b5b-4da8-af75-0886ee78dd28 has signature_requests!
  const { error: clientDeleteErr } = await supabase
    .from('clients')
    .delete()
    .eq('id', 'd430c61b-6b5b-4da8-af75-0886ee78dd28');

  if (clientDeleteErr) {
    console.log('DIRECT CLIENT DELETE ERROR:');
    console.log('Code:', clientDeleteErr.code);
    console.log('Message:', clientDeleteErr.message);
    console.log('Details:', clientDeleteErr.details);
    console.log('Hint:', clientDeleteErr.hint);
  } else {
    console.log('Client deleted directly!');
  }
}

testSignedDeleteAndTriggers();
