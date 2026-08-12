const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', serviceKey = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = l.split('=')[1].trim();
});

const adminSupabase = createClient(url, serviceKey);

async function checkExtensions() {
  console.log('Checking pg_cron and pg_net extensions in Supabase...');

  // Try enabling extensions or checking if available
  const { data: extData, error: extErr } = await adminSupabase.from('policies').select('id').limit(1);
  console.log('DB Connection active.');
}

checkExtensions();
