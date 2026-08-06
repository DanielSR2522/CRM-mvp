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

async function main() {
  const supabase = getSupabaseAdmin();
  const sql = fs.readFileSync(path.join(__dirname, '../migration_client_deletion_rpc.sql'), 'utf8');

  console.log('Sending migration SQL to Supabase...');
  
  // Try using fetch to Supabase SQL API / RPC if available
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Let's test calling pg_query or exec endpoint
  const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ sql_query: sql })
  });

  if (!response.ok) {
    const txt = await response.text();
    console.log('REST RPC exec_sql status:', response.status, txt);
  } else {
    const resData = await response.json();
    console.log('Migration executed successfully:', resData);
  }
}

main();
