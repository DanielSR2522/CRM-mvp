const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumns() {
  const { data: cData, error: cErr } = await supabase.from('clients').select('*').limit(1);
  console.log('clients keys:', Object.keys(cData?.[0] || {}));

  const { data: pData, error: pErr } = await supabase.from('client_personal_information').select('*').limit(1);
  console.log('personal keys:', Object.keys(pData?.[0] || {}));
}

checkColumns();
