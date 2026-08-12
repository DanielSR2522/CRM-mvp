const { createClient } = require('@supabase/supabase-js');
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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function audit() {
  console.log('Auditing client_company_relationships for duplicate company_client_id...');
  const { data, error } = await supabase
    .from('client_company_relationships')
    .select('id, company_client_id, personal_client_id, created_at');

  if (error) {
    console.error('Error fetching relationships:', error);
    return;
  }

  console.log(`Total relationships in DB: ${data.length}`);
  const counts = {};
  const duplicates = [];

  data.forEach(r => {
    counts[r.company_client_id] = (counts[r.company_client_id] || 0) + 1;
    if (counts[r.company_client_id] > 1) {
      duplicates.push(r);
    }
  });

  console.log('Duplicate company_client_id count:', Object.values(counts).filter(c => c > 1).length);
  if (duplicates.length > 0) {
    console.log('Duplicate rows:', duplicates);
  } else {
    console.log('Zero duplicate company relationships found!');
  }
}

audit();
