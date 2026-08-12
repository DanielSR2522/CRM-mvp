const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectPgPolicies() {
  const { data, error } = await supabase
    .rpc('get_table_policies', { t_name: 'signature_requests' })
    .catch(() => ({ data: null }));

  console.log('RPC get_table_policies signature_requests:', data || error);

  // Query via raw RPC if available, or try selecting from signature_requests
  const { data: sample, error: sampleErr } = await supabase
    .from('signature_requests')
    .select('id, client_id, status, created_by')
    .limit(1);

  console.log('Sample row:', sample, sampleErr);
}

inspectPgPolicies();
