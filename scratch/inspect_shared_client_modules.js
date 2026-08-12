const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const clientId = 'fd96dd1b-8c37-46da-be87-26ae25e49327';

  const tables = [
    'client_personal_information',
    'health_policies',
    'life_policies',
    'policies',
    'notes',
    'activity_events'
  ];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('client_id', clientId)
      .limit(20);

    console.log('\n' + table);
    if (error) {
      console.log('ERROR:', error.message);
    } else {
      console.log('Rows:', data?.length || 0);
    }
  }
}

run();
