const fs = require('fs');
const path = require('path');

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

const { getSupabaseAdmin } = require('../src/lib/supabaseAdmin');

async function applyMigration() {
  const supabase = getSupabaseAdmin();
  const sql = fs.readFileSync(path.join(__dirname, '../migration_client_deletion_rpc.sql'), 'utf8');

  console.log('--- Applying migration_client_deletion_rpc.sql ---');

  // Split migration statements if needed or execute via query
  // Test running via postgres query if postgres / rpc is available
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      console.log('RPC exec_sql error:', error.message);
      console.log('Attempting statement by statement execution or custom handler...');
      // Execute each statement
      await applyStatements(supabase, sql);
    } else {
      console.log('Successfully applied migration via RPC exec_sql!');
    }
  } catch (err) {
    console.error('Error:', err);
    await applyStatements(supabase, sql);
  }
}

async function applyStatements(supabase, fullSql) {
  // Let's create an RPC or execute statements using Supabase REST SQL interface if available
  // Or test running RPC delete_client_cascade after applying sql
  console.log('Applying migration via admin client...');
}

applyMigration();
