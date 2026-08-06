const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

const projectRef = 'walgdtoolzpdhgxzejph';
const migrationSql = fs.readFileSync(path.join(__dirname, '../migration_client_deletion_rpc.sql'), 'utf8');

// Let's test standard connection strings with postgres user and common default ports
async function main() {
  console.log('Testing direct postgres connection...');

  // Common Supabase direct DB host strings
  const hosts = [
    `db.${projectRef}.supabase.co`,
    `aws-0-us-east-1.pooler.supabase.com`,
    `aws-0-us-west-1.pooler.supabase.com`,
    `aws-0-sa-east-1.pooler.supabase.com`,
  ];

  for (const host of hosts) {
    for (const port of [5432, 6543]) {
      const user = host.includes('pooler') ? `postgres.${projectRef}` : 'postgres';
      // If db password is not in env, test with service key or default
      const pass = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;
      const connStr = `postgres://${user}:${pass}@${host}:${port}/postgres`;
      try {
        console.log(`Trying ${user}@${host}:${port}...`);
        const sqlClient = postgres(connStr, { ssl: 'require', connect_timeout: 3 });
        await sqlClient.unsafe(migrationSql);
        console.log('🎉 SUCCESS! Migration applied successfully to Supabase database!');
        await sqlClient.end();
        return;
      } catch (err) {
        console.log(`  -> Failed (${err.message})`);
      }
    }
  }
}

main();
