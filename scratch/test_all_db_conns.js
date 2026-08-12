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

// List of possible connection strings
const connStrings = [
  // Pooler standard hosts
  `postgres://postgres.${ref}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${ref}:${serviceKey}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  // Direct DB host
  `postgres://postgres:${serviceKey}@db.${ref}.supabase.co:5432/postgres`
];

async function testAll() {
  for (const cs of connStrings) {
    const host = cs.split('@')[1] || cs;
    console.log('Testing connection to:', host);
    try {
      const sql = postgres(cs, { connect_timeout: 3, ssl: 'require' });
      const res = await sql`SELECT version()`;
      console.log('🎉 SUCCESS! Connected to:', host, res[0].version);
      await sql.end();
      return cs;
    } catch (err) {
      console.log('  -> Failed:', err.message);
    }
  }
}

testAll();
