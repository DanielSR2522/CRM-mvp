const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTables() {
  const { data: sample, error } = await adminClient.from('client_documents').select('*').limit(1);
  console.log('client_documents select sample/error:', sample, error);

  // Search migrations for client_documents table creation
  const files = fs.readdirSync('supabase/migrations');
  files.forEach(f => {
    const text = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
    if (text.includes('client_document') || text.includes('CREATE TABLE')) {
      text.split('\n').forEach((line, idx) => {
        if (line.includes('CREATE TABLE') && line.includes('client')) {
          console.log(`${f}:${idx+1}: ${line.trim()}`);
        }
      });
    }
  });

  // Also check root sql files
  const rootSql = fs.readdirSync('.').filter(f => f.endsWith('.sql'));
  rootSql.forEach(f => {
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes('client_document') || text.includes('CREATE TABLE')) {
      text.split('\n').forEach((line, idx) => {
        if (line.includes('CREATE TABLE') && line.includes('client')) {
          console.log(`${f}:${idx+1}: ${line.trim()}`);
        }
      });
    }
  });
}

checkTables();
