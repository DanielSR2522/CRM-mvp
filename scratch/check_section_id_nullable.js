const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkNullable() {
  const { error } = await supabase.from('policy_documents').insert({
    id: '00000000-0000-0000-0000-000000000000',
    policy_id: '00000000-0000-0000-0000-000000000000',
    section_id: null,
    uploaded_by: '00000000-0000-0000-0000-000000000000',
    display_name: 'test',
    original_filename: 'test',
    storage_path: 'test',
    mime_type: 'text/plain',
    size_bytes: 10
  });

  console.log('Insert test with section_id = null error:', error?.message);
}

checkNullable();
