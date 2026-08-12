const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function auditMigrationTables() {
  const tables = [
    'agent_shared_access',
    'clients',
    'client_personal_information',
    'client_residence_information',
    'client_income_information',
    'policies',
    'health_policies',
    'life_policies',
    'client_notes',
    'calendar_appointments',
    'leads',
    'consent_templates',
    'signature_requests'
  ];

  console.log('====================================================');
  console.log('STATIC SCHEMA AUDIT OF MIGRATION TABLES');
  console.log('====================================================\n');

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Table '${t}': ERROR ->`, error.message);
    } else {
      const cols = data && data.length > 0 ? Object.keys(data[0]) : 'Empty table (no sample row)';
      console.log(`Table '${t}':`);
      console.log('  Columns:', cols);
    }
  }

  // Also query existing RLS policies on signature_requests from pg_policies if accessible
  console.log('\n--- Querying existing pg_policies for signature_requests ---');
  const { data: sigPolicies, error: sigErr } = await supabase
    .from('signature_requests')
    .select('id, client_id, status, created_by')
    .limit(1);
  console.log('Sample signature_requests row:', sigPolicies);
}

auditMigrationTables();
