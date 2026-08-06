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

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '').trim();
  console.log('Project Ref:', projectRef);

  // Check if DB password or connection string is in env
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  
  if (!dbUrl) {
    console.log('No direct DATABASE_URL found in .env.local.');
    console.log('Env keys present:');
    Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('VSCODE_')).forEach(k => console.log(' -', k));
    return;
  }

  console.log('Connecting to PostgreSQL using DATABASE_URL...');
  const sqlClient = postgres(dbUrl, { ssl: 'require' });
  const migrationSql = fs.readFileSync(path.join(__dirname, '../migration_client_deletion_rpc.sql'), 'utf8');

  try {
    await sqlClient.unsafe(migrationSql);
    console.log('Successfully executed migration_client_deletion_rpc.sql via postgres!');
  } catch (err) {
    console.error('Error executing SQL via postgres:', err);
  } finally {
    await sqlClient.end();
  }
}

main();
