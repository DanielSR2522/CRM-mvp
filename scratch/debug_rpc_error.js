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

async function debugRpc() {
  const supabase = getSupabaseAdmin();
  const testAgentId = '4f698c2f-f9e0-42d1-996e-a9ee4a574ea9';

  console.log('Creating test client...');
  const { data: c, error: insErr } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Debug Client' })
    .select('*')
    .single();

  console.log('Insert res:', c, insErr);

  if (c) {
    console.log('Calling delete_client_cascade...');
    const { data: res, error: rpcErr } = await supabase.rpc('delete_client_cascade', {
      p_client_id: c.id,
      p_agent_id: testAgentId
    });

    console.log('RPC result:', res);
    console.log('RPC error:', rpcErr);
  }
}

debugRpc();
