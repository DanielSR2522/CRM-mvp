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
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name')
    .or('email.ilike.%laura%,first_name.ilike.%laura%,last_name.ilike.%merlo%');

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  console.table(data);
}

run();
