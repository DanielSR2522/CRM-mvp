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
  const email = 'amandarperezinsurance@gmail.com';

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: 'http://localhost:3001'
    }
  });

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  console.log('\nLOGIN LINK FOR AMANDA:\n');
  console.log(data.properties.action_link);
}

run();
