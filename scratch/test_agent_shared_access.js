const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAccess() {
  console.log('Testing can_access_agent DB function...');
  
  // Test direct RPC call
  const dummyUuid1 = '00000000-0000-0000-0000-000000000001';
  const { data: rpcData, error: rpcError } = await supabase.rpc('can_access_agent', { target_agent_id: dummyUuid1 });
  
  if (rpcError) {
    console.error('RPC Error:', rpcError.message);
  } else {
    console.log('RPC can_access_agent returned:', rpcData);
  }

  // Query shared_access table
  const { data: shares, error: shareErr } = await supabase.from('agent_shared_access').select('*').limit(5);
  if (shareErr) {
    console.error('Shared Access Table Error:', shareErr.message);
  } else {
    console.log('Successfully queried agent_shared_access table! Row count:', shares ? shares.length : 0);
  }

  console.log('Audit Verification Complete!');
}

testAccess();
