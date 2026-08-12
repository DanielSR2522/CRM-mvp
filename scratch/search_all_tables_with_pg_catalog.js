const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testAllTables() {
  const list = [
    'client_documents', 'client_document', 'client_files', 'client_file',
    'client_attachments', 'client_attachment', 'client_note_attachments',
    'policy_documents', 'policy_document_sections'
  ];

  for (const t of list) {
    const { error } = await adminClient.from(t).select('*').limit(1);
    console.log(`Table '${t}': ${error ? error.message : 'EXISTS'}`);
  }
}

testAllTables();
