const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Supabase URL or Key missing in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function audit() {
  const { data: policies, error: pErr } = await supabase
    .from('policies')
    .select('id, client_id, policy_number, policy_type, policy_ownership_type');

  if (pErr) {
    console.error('Error fetching policies:', pErr);
    return;
  }

  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, full_name, client_type');

  if (cErr) {
    console.error('Error fetching clients:', cErr);
    return;
  }

  const clientMap = {};
  (clients || []).forEach(c => clientMap[c.id] = c);

  const mismatches = [];
  (policies || []).forEach(p => {
    const client = clientMap[p.client_id];
    if (client) {
      const expectedOwnership = client.client_type === 'company' ? 'company' : 'personal';
      const actualOwnership = p.policy_ownership_type || 'personal';
      if (expectedOwnership !== actualOwnership) {
        mismatches.push({
          policy_id: p.id,
          policy_number: p.policy_number,
          client_id: p.client_id,
          client_name: client.full_name,
          client_type: client.client_type,
          stored_policy_ownership_type: p.policy_ownership_type
        });
      }
    }
  });

  console.log('AUDIT RESULT: Total Mismatches = ' + mismatches.length);
  if (mismatches.length > 0) {
    console.log(JSON.stringify(mismatches, null, 2));
  } else {
    console.log('No mismatches found between clients.client_type and policies.policy_ownership_type in active DB.');
  }
}

audit();
