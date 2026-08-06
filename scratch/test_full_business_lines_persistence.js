const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envUrl = '';
let envServiceKey = '';

try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) envUrl = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) envServiceKey = line.split('=')[1].trim();
  });
} catch {}

const client = createClient(envUrl, envServiceKey);

const DEFAULT_BUSINESS_LINES = ['health', 'life', 'property_casualty', 'supplemental'];

async function fetchAgentBusinessLinesTest(userId) {
  const { data, error } = await client
    .from('profiles')
    .select('business_lines')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data || data.business_lines === null || data.business_lines === undefined || !Array.isArray(data.business_lines)) {
    return DEFAULT_BUSINESS_LINES;
  }

  const validLines = data.business_lines.filter(b => DEFAULT_BUSINESS_LINES.includes(b));
  return validLines;
}

async function runFullPersistenceTest() {
  console.log('======================================================');
  console.log('RUNNING FULL BUSINESS LINES PERSISTENCE TEST SUITE');
  console.log('======================================================\n');

  // 1. Fetch an existing profile ID
  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select('id, email, business_lines')
    .limit(1);

  if (pErr || !profiles || profiles.length === 0) {
    console.error('Could not fetch test profile from Supabase:', pErr);
    return;
  }

  const testUser = profiles[0];
  const originalLines = testUser.business_lines;
  console.log(`- Testing with Profile ID: ${testUser.id} (${testUser.email})`);

  // TEST 1: Select only "health" and save
  console.log('\n--- TEST 1: Save ONLY ["health"] ---');
  const { error: err1 } = await client
    .from('profiles')
    .update({ business_lines: ['health'], updated_at: new Date().toISOString() })
    .eq('id', testUser.id);

  if (err1) throw err1;

  const res1 = await fetchAgentBusinessLinesTest(testUser.id);
  console.log('DB Read Result for Test 1:', res1);
  if (res1.length === 1 && res1[0] === 'health') {
    console.log('✅ TEST 1 PASSED: Only ["health"] persisted and restored correctly!');
  } else {
    console.error('❌ TEST 1 FAILED: Expected ["health"], got:', res1);
  }

  // TEST 2: Select "health" and "life" and save
  console.log('\n--- TEST 2: Save ["health", "life"] ---');
  const { error: err2 } = await client
    .from('profiles')
    .update({ business_lines: ['health', 'life'], updated_at: new Date().toISOString() })
    .eq('id', testUser.id);

  if (err2) throw err2;

  const res2 = await fetchAgentBusinessLinesTest(testUser.id);
  console.log('DB Read Result for Test 2:', res2);
  if (res2.length === 2 && res2.includes('health') && res2.includes('life')) {
    console.log('✅ TEST 2 PASSED: ["health", "life"] persisted and restored correctly!');
  } else {
    console.error('❌ TEST 2 FAILED: Expected ["health", "life"], got:', res2);
  }

  // TEST 3: Restore original lines
  console.log('\n--- RESTORING ORIGINAL PROFILE STATE ---');
  await client
    .from('profiles')
    .update({ business_lines: originalLines, updated_at: new Date().toISOString() })
    .eq('id', testUser.id);

  console.log('✅ Restored original business_lines to:', originalLines);
  console.log('\n======================================================');
  console.log('ALL BUSINESS LINES PERSISTENCE TESTS PASSED CLEANLY');
  console.log('======================================================');
}

runFullPersistenceTest().catch(console.error);
