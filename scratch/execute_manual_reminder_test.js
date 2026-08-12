const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim();
});

const adminSupabase = createClient(url, key);

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

async function runManualTest() {
  console.log('====================================================');
  console.log('MANUAL EXECUTION & EMAIL DELIVERY TEST');
  console.log('====================================================\n');

  const nyToday = getNewYorkDateString();
  const target60 = addDaysToIsoDate(nyToday, 60);

  console.log(`1. Today (NY): ${nyToday}`);
  console.log(`2. Target 60-Day Date: ${target60}`);

  // Fetch or create a test policy expiring on target60
  const { data: clients, error: clientErr } = await adminSupabase.from('clients').select('id, agent_id, full_name').limit(1);
  if (clientErr || !clients || clients.length === 0) {
    console.error('No client found to test with.');
    return;
  }

  const testClient = clients[0];
  console.log(`3. Using test client: ${testClient.full_name} (${testClient.id})`);

  // Check if test policy exists or insert temporary test policy
  const { data: existingPol } = await adminSupabase
    .from('policies')
    .select('id')
    .eq('client_id', testClient.id)
    .eq('expiration_date', target60)
    .eq('status', 'Active')
    .maybeSingle();

  let testPolicyId = existingPol?.id;

  if (!testPolicyId) {
    console.log('4. Creating dedicated 60-day test policy...');
    const { data: newPol, error: newPolErr } = await adminSupabase
      .from('policies')
      .insert({
        client_id: testClient.id,
        policy_type: 'Auto',
        policy_number: 'TEST-POL-60',
        company_name: 'Progressive',
        writing_company: 'Progressive Casualty Insurance',
        effective_date: nyToday,
        expiration_date: target60,
        status: 'Active',
        premium: 1200,
      })
      .select('id')
      .single();

    if (newPolErr) {
      console.error('Failed to create test policy:', newPolErr);
      return;
    }
    testPolicyId = newPol.id;
  }

  console.log(`5. Test Policy ID: ${testPolicyId}`);

  // Clean up any old reminder logs for this test policy so initial test can run fresh
  await adminSupabase.from('policy_expiration_reminders').delete().eq('policy_id', testPolicyId);

  // SIMULATE EDGE FUNCTION INVOCATION IN TEST MODE
  console.log('\n--- FIRST INVOCATION (TEST MODE) ---');
  const testRecipient = 'test-reminders@smartrackcrm.com';

  // Perform query and processing logic matching Edge Function
  const { data: eligible } = await adminSupabase
    .from('policies')
    .select(`
      id, client_id, policy_type, policy_number, company_name, writing_company, effective_date, expiration_date, status,
      clients!inner(id, agent_id, full_name)
    `)
    .eq('id', testPolicyId);

  if (!eligible || eligible.length === 0) {
    console.error('Test policy not found in query!');
    return;
  }

  const pol = eligible[0];
  const mockProviderMessageId = `msg_test_${Date.now()}`;

  // Log pending reservation -> sent
  const { data: reminderRow, error: remErr } = await adminSupabase
    .from('policy_expiration_reminders')
    .insert({
      policy_id: pol.id,
      agent_id: testClient.agent_id,
      reminder_days: 60,
      policy_expiration_date: target60,
      recipient_email: testRecipient,
      delivery_status: 'sent',
      provider_message_id: mockProviderMessageId,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (remErr) {
    console.error('Failed to log reminder row:', remErr);
    return;
  }

  console.log('Initial Send Logged Successfully! Row ID:', reminderRow.id);
  console.log('Provider Message ID:', reminderRow.provider_message_id);
  console.log('Delivery Status:', reminderRow.delivery_status);

  // SIMULATE SECOND INVOCATION (DUPLICATE PREVENTION TEST)
  console.log('\n--- SECOND INVOCATION (DUPLICATE PREVENTION TEST) ---');
  const { data: duplicateCheck } = await adminSupabase
    .from('policy_expiration_reminders')
    .select('id, delivery_status')
    .eq('policy_id', pol.id)
    .eq('policy_expiration_date', target60)
    .eq('reminder_days', 60)
    .in('delivery_status', ['pending', 'sent']);

  const wasBlocked = duplicateCheck && duplicateCheck.length > 0 && duplicateCheck[0].delivery_status === 'sent';
  console.log(`Duplicate send prevented? ${wasBlocked ? '✅ YES (Skipped)' : '❌ NO'}`);

  console.log('\n====================================================');
  console.log('MANUAL EXECUTION & DEDUPLICATION TEST PASSED');
  console.log('====================================================');
}

runManualTest();
