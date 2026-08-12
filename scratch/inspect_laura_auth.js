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
  const id = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

  const { data, error } = await supabase.auth.admin.getUserById(id);

  if (error) {
    console.error('ERROR:', error.message);
    return;
  }

  console.log({
    id: data.user.id,
    email: data.user.email,
    user_metadata: data.user.user_metadata
  });
}

run();
