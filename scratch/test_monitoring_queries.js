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
  console.log('TESTING MONITORING & FAILURE QUERIES');
  console.log('====================================================\n');

  console.log('1. Testing Monitoring Query (Recent History):');
  const { data: history, error: historyErr } = await adminSupabase
    .from('policy_expiration_reminders')
    .select('created_at, policy_id, agent_id, reminder_days, policy_expiration_date, recipient_email, delivery_status, provider_message_id, error_message, sent_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (historyErr) console.error('History Query Error:', historyErr);
  else console.log(`History Query Success (${history.length} records returned):`, history);

  console.log('\n2. Testing Failure Check Query (Failed Last 7 Days):');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: failures, error: failErr } = await adminSupabase
    .from('policy_expiration_reminders')
    .select('created_at, policy_id, agent_id, reminder_days, policy_expiration_date, recipient_email, delivery_status, error_message, attempted_at')
    .eq('delivery_status', 'failed')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false });

  if (failErr) console.error('Failure Query Error:', failErr);
  else console.log(`Failure Query Success (${failures.length} failed records found):`, failures);
}

main();
