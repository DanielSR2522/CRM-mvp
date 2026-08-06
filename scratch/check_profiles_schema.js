const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envUrl = '';
let envServiceKey = '';

try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) envUrl = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) envServiceKey = line.split('=')[1].trim();
  });
} catch {}

const client = createClient(envUrl, envServiceKey);

async function checkProfilesSchema() {
  console.log('=== CHECKING PUBLIC.PROFILES COLUMNS ===');
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error selecting from profiles:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Existing columns on profiles:', Object.keys(data[0]));
    console.log('Sample profile row:', data[0]);
  } else {
    console.log('No rows found in profiles table.');
    // Let's inspect column definitions from information_schema if possible or query empty profile
    const { data: cols, error: cErr } = await client.rpc('get_table_columns', { table_name: 'profiles' }).catch(() => ({ data: null }));
    console.log('Cols:', cols, cErr);
  }
}

checkProfilesSchema().catch(console.error);
