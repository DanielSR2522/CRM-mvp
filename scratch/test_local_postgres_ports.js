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

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const migrationSql = fs.readFileSync(path.join(__dirname, '../migration_client_deletion_rpc.sql'), 'utf8');

async function testLocalPorts() {
  const localHosts = ['127.0.0.1', 'localhost'];
  const ports = [5432, 54322, 54321, 6543];

  for (const host of localHosts) {
    for (const port of ports) {
      console.log(`Testing ${host}:${port}...`);
      try {
        const connStr = `postgres://postgres:${serviceKey}@${host}:${port}/postgres`;
        const sqlClient = postgres(connStr, { connect_timeout: 2 });
        await sqlClient.unsafe(migrationSql);
        console.log(`🎉 SUCCESS! Connected to local PostgreSQL on ${host}:${port} and applied migration!`);
        await sqlClient.end();
        return;
      } catch (err) {
        console.log(`  -> ${err.message}`);
      }
    }
  }
}

testLocalPorts();
