const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envUrl = '';
let envAnonKey = '';
let envServiceKey = '';

try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) envUrl = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) envAnonKey = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) envServiceKey = line.split('=')[1].trim();
  });
} catch {}

const client = createClient(envUrl, envServiceKey);

async function testFullSaveAndSelectFlow() {
  console.log('===========================================================');
  console.log('TESTING SUPABASE UPDATE WITH .select("id, business_lines").single()');
  console.log('===========================================================');

  // Fetch an existing profile
  const { data: profiles, error: fetchErr } = await client
    .from('profiles')
    .select('id, email, business_lines')
    .limit(1);

  if (fetchErr || !profiles || profiles.length === 0) {
    console.error('Failed to fetch test profile:', fetchErr);
    return;
  }

  const testUser = profiles[0];
  console.log(`AUTHENTICATED USER ID: ${testUser.id} (${testUser.email})`);
  console.log(`INITIAL BUSINESS LINES IN DB:`, testUser.business_lines);

  // 1. Update to ONLY ['health']
  const selectedLines = ['health'];
  console.log(`\nSELECTED LINES BEFORE SAVE:`, selectedLines);

  const updatePayload = {
    business_lines: selectedLines,
    updated_at: new Date().toISOString()
  };
  console.log(`EXACT SUPABASE UPDATE PAYLOAD:`, updatePayload);

  const { data: updatedProfile, error: updateErr } = await client
    .from('profiles')
    .update(updatePayload)
    .eq('id', testUser.id)
    .select('id, business_lines')
    .single();

  console.log(`SUPABASE UPDATE RESULT:`, { data: updatedProfile, error: updateErr });

  if (updateErr || !updatedProfile) {
    console.error('❌ UPDATE FAILED!');
    return;
  }

  console.log(`SAVED BUSINESS LINES:`, updatedProfile.business_lines);

  // 2. Fetch back simulating page refresh
  const { data: refreshedProfile, error: refreshErr } = await client
    .from('profiles')
    .select('*')
    .eq('id', testUser.id)
    .single();

  console.log(`\nLOADED BUSINESS LINES ON REFRESH:`, refreshedProfile.business_lines);

  if (JSON.stringify(refreshedProfile.business_lines) === JSON.stringify(['health'])) {
    console.log('✅ REFRESH TEST PASSED: Loaded array matches ["health"] exactly!');
  } else {
    console.error('❌ REFRESH TEST FAILED: Loaded array does not match!');
  }

  // Restore original
  await client.from('profiles').update({ business_lines: testUser.business_lines }).eq('id', testUser.id);
  console.log('\nRestored original profile lines.');
}

testFullSaveAndSelectFlow().catch(console.error);
