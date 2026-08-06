const fs = require('fs');
const path = require('path');

// Load .env.local manually
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

async function inspectForeignKeys() {
  const supabase = getSupabaseAdmin();
  
  console.log('--- Checking tables ---');
  
  const tables = [
    'clients',
    'signature_requests',
    'signature_request_recipients',
    'signature_request_events',
    'signature_files',
    'signed_documents',
    'client_consents',
    'consents',
    'client_personal_information',
    'client_co_applicant_information',
    'client_residence_information',
    'client_income_information',
    'tax_household_members',
    'personal_commercial_policy_links',
    'policies',
    'health_policies',
    'notes',
    'activity_events'
  ];

  for (const t of tables) {
    try {
      const { data, error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`Table ${t}: Error (${error.message})`);
      } else {
        console.log(`Table ${t}: Exists (${count} rows)`);
      }
    } catch (e) {
      console.log(`Table ${t}: Exception (${e.message})`);
    }
  }

  // Let's test querying signature_requests and dependent tables
  console.log('\n--- Checking signature_requests table ---');
  const { data: sigs, error: sigErr } = await supabase.from('signature_requests').select('*');
  console.log('Signature requests count:', sigs ? sigs.length : 0, sigErr ? sigErr.message : 'OK');
  if (sigs && sigs.length > 0) {
    console.log('Sample signature request:', sigs[0]);
  }
}

inspectForeignKeys();
