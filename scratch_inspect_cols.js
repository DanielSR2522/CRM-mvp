const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectClientDocumentsSchema() {
  console.log('--- Inspecting client_documents Schema & RLS ---');

  // Fetch one row from client_documents to see actual column names
  const { data, error } = await supabase.from('client_documents').select('*').limit(1);
  if (error) {
    console.error('Error selecting from client_documents:', error);
    return;
  }
  console.log('Sample row from client_documents:', data);

  if (data && data.length > 0) {
    console.log('Columns in client_documents:', Object.keys(data[0]));
  }
}

inspectClientDocumentsSchema();
