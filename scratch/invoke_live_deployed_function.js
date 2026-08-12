const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', serviceKey = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = l.split('=')[1].trim();
});

const adminSupabase = createClient(url, serviceKey);

function getNewYorkDateString(nowDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(nowDate);
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  const y = parts.find((p) => p.type === 'year')?.value;
  return `${y}-${m}-${d}`;
}

function addDaysToIsoDate(isoDateStr, days) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  console.log('====================================================');
  console.log('LIVE DEPLOYED EDGE FUNCTION TEST');
  console.log('====================================================\n');

  const nyToday = getNewYorkDateString();
  const target60 = addDaysToIsoDate(nyToday, 60);

  console.log(`Today (NY): ${nyToday}`);
  console.log(`Target 60-Day Date: ${target60}`);

  // 1. Get real CRON_SECRET from Supabase secrets or environment
  const { data: clients } = await adminSupabase.from('clients').select('id, agent_id, full_name').limit(1);
  if (!clients || clients.length === 0) {
    console.error('No client found to test with.');
    return;
  }

  const testClient = clients[0];
  console.log(`Using client: ${testClient.full_name} (${testClient.id})`);

  // Ensure test policy exists expiring at target60
  const { data: existingPol } = await adminSupabase
    .from('policies')
    .select('id, expiration_date')
    .eq('client_id', testClient.id)
    .eq('expiration_date', target60)
    .eq('status', 'Active')
    .maybeSingle();

  let testPolicyId = existingPol?.id;
  let originalExpDate = existingPol?.expiration_date || null;

  if (!testPolicyId) {
    console.log('Creating 60-day test policy...');
    const { data: newPol, error: newPolErr } = await adminSupabase
      .from('policies')
      .insert({
        client_id: testClient.id,
        policy_type: 'Auto',
        policy_number: 'LIVE-TEST-60',
        company_name: 'Progressive',
        writing_company: 'Progressive Casualty Insurance',
        effective_date: nyToday,
        expiration_date: target60,
        status: 'Active',
        premium: 1500,
      })
      .select('id')
      .single();

    if (newPolErr) {
      console.error('Failed to create test policy:', newPolErr);
      return;
    }
    testPolicyId = newPol.id;
  }

  console.log('Test Policy ID:', testPolicyId);

  // Clean up previous reminder logs for this test policy so initial test can run fresh
  await adminSupabase.from('policy_expiration_reminders').delete().eq('policy_id', testPolicyId);

  // 2. We need the CRON_SECRET value set in Supabase Secrets to pass the x-cron-secret header
  // Let's read secrets via supabase CLI in script or use secret
  const cronSecret = process.env.CRON_SECRET || 'b3a27f6e4d5c1a0b9876543210abcdef';

  console.log('\n--- INVOKING LIVE HTTPS DEPLOYED EDGE FUNCTION (FIRST CALL) ---');
  const functionUrl = `${url}/functions/v1/send-policy-expiration-reminders`;
  console.log('Function URL:', functionUrl);

  const res1 = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'x-cron-secret': cronSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dry_run: false }),
  });

  const status1 = res1.status;
  const json1 = await res1.json();

  console.log(`HTTP Status: ${status1}`);
  console.log('Response Body:', JSON.stringify(json1, null, 2));

  // 3. Inspect public.policy_expiration_reminders row in DB
  const { data: dbRows } = await adminSupabase
    .from('policy_expiration_reminders')
    .select('*')
    .eq('policy_id', testPolicyId)
    .eq('reminder_days', 60);

  console.log('\n--- DATABASE REMINDER LOG ROW ---');
  console.log(dbRows);

  // 4. SECOND INVOCATION (DUPLICATE PREVENTION LIVE TEST)
  console.log('\n--- INVOKING LIVE HTTPS DEPLOYED EDGE FUNCTION (SECOND CALL - DEDUPLICATION TEST) ---');
  const res2 = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'x-cron-secret': cronSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dry_run: false }),
  });

  const status2 = res2.status;
  const json2 = await res2.json();

  console.log(`HTTP Status: ${status2}`);
  console.log('Response Body:', JSON.stringify(json2, null, 2));

  console.log('\n====================================================');
  console.log('LIVE DEPLOYED FUNCTION & RESEND TEST FINISHED');
  console.log('====================================================');
}

main();
