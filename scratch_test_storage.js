const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Test with ANON KEY (same as client-side JS!)

const supabase = createClient(supabaseUrl, supabaseKey);

async function testClientSideUpload() {
  console.log('--- Testing Client-Side Upload & Query ---');

  // Test session
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  console.log('Session user:', sessionData?.session?.user?.id || 'No active session (Anon)');

  // Test selecting client_documents with module_type = 'supplemental'
  const { data: docs, error: docErr } = await supabase
    .from('client_documents')
    .select('*')
    .eq('module_type', 'supplemental');

  if (docErr) {
    console.error('Error fetching supplemental client_documents:', docErr);
  } else {
    console.log('Supplemental docs in DB:', docs);
  }
}

testClientSideUpload();
