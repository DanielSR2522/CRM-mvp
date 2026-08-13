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

async function testMultiPolicy() {
  console.log('--- Testing Multi Policy Database Functionality ---');
  
  // 1. Fetch a client
  const { data: clients, error: clientErr } = await supabase.from('clients').select('id, full_name, client_type').limit(5);
  if (clientErr) {
    console.error('Error fetching clients:', clientErr);
    return;
  }
  
  console.log('Sample clients:', clients);

  // 2. Fetch policies grouped by client_id
  const { data: policies, error: polErr } = await supabase.from('policies').select('id, client_id, policy_type, policy_number, status, policy_ownership_type');
  if (polErr) {
    console.error('Error fetching policies:', polErr);
    return;
  }

  const byClient = {};
  policies.forEach(p => {
    if (!byClient[p.client_id]) byClient[p.client_id] = [];
    byClient[p.client_id].push(p);
  });

  console.log(`Total policies in DB: ${policies.length}`);
  Object.keys(byClient).forEach(cid => {
    console.log(`Client ${cid} has ${byClient[cid].length} policies:`, byClient[cid].map(p => ({ id: p.id, type: p.policy_type, num: p.policy_number })));
  });
}

testMultiPolicy();
