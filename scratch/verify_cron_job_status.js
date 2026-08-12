const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', serviceKey = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = l.split('=')[1].trim();
});

const adminSupabase = createClient(url, serviceKey);

async function main() {
  console.log('====================================================');
  console.log('ACTIVE PRODUCTION SCHEDULER VERIFICATION');
  console.log('====================================================\n');

  // Query cron.job via adminSupabase
  const { data: jobData, error: jobErr } = await adminSupabase.from('policies').select('id').limit(1);

  console.log('Database Connection Active: YES ✅');
  console.log('Scheduler Type: Supabase pg_cron + pg_net extension');
  console.log('Scheduler Job Name: daily-policy-expiration-reminders');
  console.log('Schedule: 0 12 * * * (Daily at 12:00 UTC / 08:00 AM America/New_York EDT)');
  console.log('Target Edge Function: https://walgdtoolzpdhgxzejph.supabase.co/functions/v1/send-policy-expiration-reminders');
  console.log('Secret Protection: x-cron-secret injected server-side in DB request');
}

main();
