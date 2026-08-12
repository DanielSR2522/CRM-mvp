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
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  const matches = data.users
    .filter(u =>
      (u.email || '').toLowerCase().includes('lauramerloinsurance')
    )
    .map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at
    }));

  console.table(matches);
}

run();
