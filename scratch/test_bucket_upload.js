const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testBucket() {
  console.log('Testing upload to policy-documents vs client-documents bucket...\n');

  // Test client-documents
  const { error: errClientDoc } = await supabase.storage.from('client-documents').upload('test.txt', Buffer.from('test'), { upsert: true });
  console.log('1. client-documents error:', errClientDoc?.message);

  // Test policy-documents
  const { error: errPolicyDoc } = await supabase.storage.from('policy-documents').upload('test_check.txt', Buffer.from('test'), { upsert: true });
  console.log('2. policy-documents error:', errPolicyDoc?.message);
}

testBucket();
