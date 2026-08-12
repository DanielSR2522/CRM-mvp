const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim();
});

const adminSupabase = createClient(url, key);

async function main() {
  console.log('====================================================');
  console.log('AUDIT 1: ACTIVE DATABASE SCHEMA & CONSTRAINTS');
  console.log('====================================================\n');
  console.log('Supabase URL:', url);

  // 1. Check if policy_expiration_reminders table exists in active DB
  const { data: tableCheck, error: tableErr } = await adminSupabase
    .from('policy_expiration_reminders')
    .select('id')
    .limit(1);

  if (tableErr) {
    console.error('Table error:', tableErr);
  } else {
    console.log('Table public.policy_expiration_reminders exists in active DB! ✅ PASS');
  }

  // 2. Audit env variables for Edge Function & Resend
  console.log('\n====================================================');
  console.log('AUDIT 2: LOCAL & ENVIRONMENT SECRETS CHECK');
  console.log('====================================================\n');

  const resendKeyMatch = envFile.match(/RESEND_API_KEY=(.*)/);
  const cronSecretMatch = envFile.match(/CRON_SECRET=(.*)/);
  const testEmailMatch = envFile.match(/POLICY_REMINDER_TEST_EMAIL=(.*)/);
  const fromEmailMatch = envFile.match(/POLICY_REMINDER_FROM_EMAIL=(.*)/);

  const resendKey = process.env.RESEND_API_KEY || (resendKeyMatch ? resendKeyMatch[1].trim() : '');
  const cronSecret = process.env.CRON_SECRET || (cronSecretMatch ? cronSecretMatch[1].trim() : '');
  const testEmail = process.env.POLICY_REMINDER_TEST_EMAIL || (testEmailMatch ? testEmailMatch[1].trim() : '');
  const fromEmail = process.env.POLICY_REMINDER_FROM_EMAIL || (fromEmailMatch ? fromEmailMatch[1].trim() : '');

  console.log('SUPABASE_URL:', url ? 'CONFIGURED ✅' : 'MISSING ❌');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', key ? 'CONFIGURED ✅' : 'MISSING ❌');
  console.log('RESEND_API_KEY:', resendKey ? 'CONFIGURED ✅' : 'MISSING ❌');
  console.log('CRON_SECRET:', cronSecret ? 'CONFIGURED ✅' : 'MISSING ❌');
  console.log('POLICY_REMINDER_TEST_EMAIL:', testEmail ? `CONFIGURED (${testEmail}) ✅` : 'MISSING ❌');
  console.log('POLICY_REMINDER_FROM_EMAIL:', fromEmail ? `CONFIGURED (${fromEmail}) ✅` : 'DEFAULT (reminders@updates.smartrackcrm.com)');
}

main();
