const postgres = require('postgres');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const ref = 'walgdtoolzpdhgxzejph';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Try connection strings
const hosts = [
  `postgres://postgres:${serviceKey}@db.${ref}.supabase.co:5432/postgres`,
  `postgres://postgres:${serviceKey}@db.${ref}.supabase.co:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
];

async function test() {
  for (const h of hosts) {
    console.log('Testing host:', h.split('@')[1]);
    try {
      const sql = postgres(h, { connect_timeout: 4, ssl: 'require' });
      const res = await sql`SELECT 1 as val`;
      console.log('SUCCESS with:', h.split('@')[1], res);
      await sql.end();
      return h;
    } catch (e) {
      console.log('  Failed:', e.message);
    }
  }
}

test();
