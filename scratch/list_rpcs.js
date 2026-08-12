const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function listRpcs() {
  const { data, error } = await supabase.rpc('delete_client_cascade', { p_client_id: '00000000-0000-0000-0000-000000000000', p_agent_id: '00000000-0000-0000-0000-000000000000' });
  console.log('delete_client_cascade check:', error ? error.message : 'OK');
}

listRpcs();
