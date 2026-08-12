const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function listAllTables() {
  // Query common candidate table names
  const candidateTables = [
    'clients', 'policies', 'policy_documents', 'health_policy_documents',
    'life_policy_documents', 'life_documents', 'lead_documents', 'client_documents',
    'client_notes', 'client_note_attachments'
  ];

  console.log('=== CHECKING CANDIDATE DB TABLES ===');
  for (const t of candidateTables) {
    const { error } = await adminClient.from(t).select('id').limit(1);
    console.log(`Table '${t}': ${error ? '❌ ' + error.message : '✅ EXISTS'}`);
  }
}

listAllTables();
