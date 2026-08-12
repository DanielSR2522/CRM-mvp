const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};

envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) {
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    env[k] = v;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const emails = [
    'amandarperezinsurance@gmail.com',
    'lauramerloinsurance@gmail.com'
  ];

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name')
    .in('email', emails);

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  console.table(data);
}

run();
