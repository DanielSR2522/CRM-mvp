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

async function listRpcs() {
  const supabase = getSupabaseAdmin();
  
  const testRpcs = [
    'log_lead_timeline_event',
    'exec_sql',
    'execute_sql',
    'sql',
    'query',
    'delete_client_cascade'
  ];

  for (const rpcName of testRpcs) {
    try {
      const { data, error } = await supabase.rpc(rpcName, {});
      console.log(`RPC '${rpcName}':`, error ? `${error.code} - ${error.message}` : 'SUCCESS');
    } catch (e) {
      console.log(`RPC '${rpcName}': Exception - ${e.message}`);
    }
  }
}

listRpcs();
