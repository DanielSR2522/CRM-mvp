const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sqlPath = path.join(__dirname, '../supabase/migrations/20260817000000_create_medicare_module.sql');
const migrationSql = fs.readFileSync(sqlPath, 'utf8');

async function applyMigration() {
  const projectRef = 'walgdtoolzpdhgxzejph';
  const connStrings = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    `postgres://postgres.${projectRef}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgres://postgres.${projectRef}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgres://postgres:${serviceKey}@127.0.0.1:54322/postgres`,
    `postgres://postgres:${serviceKey}@127.0.0.1:5432/postgres`,
  ].filter(Boolean);

  for (const connStr of connStrings) {
    console.log(`Attempting connection: ${connStr.replace(serviceKey, '***')}...`);
    try {
      const sqlClient = postgres(connStr, { connect_timeout: 5, ssl: connStr.includes('supabase.com') ? 'require' : false });
      await sqlClient.unsafe(migrationSql);
      console.log(`🎉 SUCCESS! Applied 20260817000000_create_medicare_module.sql!`);
      await sqlClient.end();
      return;
    } catch (err) {
      console.log(`  -> Failed: ${err.message}`);
    }
  }

  console.error('All direct connections failed.');
}

applyMigration();
