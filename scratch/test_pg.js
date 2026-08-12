const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

// Check rest endpoint for exec or query or rpc
async function run() {
  console.log('Testing RPC or SQL...');
  // Try sending SQL query via REST API or postgres endpoints
  try {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ query: "ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ein TEXT; NOTIFY pgrst, 'reload schema';" })
    });
    console.log('exec_sql status:', res.status);
    const text = await res.text();
    console.log('exec_sql response:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
