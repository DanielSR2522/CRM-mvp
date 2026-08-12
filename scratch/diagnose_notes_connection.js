const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = {};
fs.readFileSync('.env.local','utf8').split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) {
    env[line.slice(0,i).trim()] =
      line.slice(i+1).trim().replace(/^["']|["']$/g,'');
  }
});

console.log('\nSUPABASE URL:');
console.log(env.NEXT_PUBLIC_SUPABASE_URL);

async function test(label, key) {
  const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false }
  });

  const { data, error } = await s
    .from('client_notes')
    .select('id')
    .limit(1);

  console.log(`\n${label}:`);
  if (error) {
    console.log('ERROR CODE:', error.code);
    console.log('ERROR:', error.message);
  } else {
    console.log('client_notes OK');
    console.log('rows returned:', data.length);
  }
}

(async () => {
  await test('SERVICE ROLE', env.SUPABASE_SERVICE_ROLE_KEY);
  await test('ANON KEY', env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
})();
