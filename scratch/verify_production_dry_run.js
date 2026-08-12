const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', serviceKey = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = l.split('=')[1].trim();
});

async function main() {
  console.log('====================================================');
  console.log('DRY-RUN VERIFICATION (PRODUCTION AGENT RECIPIENT RESOLUTION)');
  console.log('====================================================\n');

  const cronSecret = 'b3a27f6e4d5c1a0b9876543210abcdef';
  const functionUrl = `${url}/functions/v1/send-policy-expiration-reminders`;

  console.log('Invoking Edge Function in DRY-RUN mode...');
  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'x-cron-secret': cronSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dry_run: true }),
  });

  const status = res.status;
  const json = await res.json();

  console.log(`HTTP Status: ${status}`);
  console.log('Response Body:\n', JSON.stringify(json, null, 2));

  if (json.test_mode === false && json.test_email === null) {
    console.log('\n✅ TEST MODE IS OFF! Production recipient resolution active.');
  } else {
    console.error('\n❌ TEST MODE IS STILL ACTIVE!');
  }
}

main();
