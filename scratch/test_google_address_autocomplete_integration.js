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

async function testAddressPersistence() {
  console.log('===========================================================');
  console.log('TESTING GOOGLE ADDRESS AUTOCOMPLETE PERSISTENCE TO SUPABASE');
  console.log('===========================================================\n');

  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select('id, name, email, address, city, state, zip_code, country, business_lines')
    .limit(1);

  if (pErr || !profiles || profiles.length === 0) {
    console.error('Error fetching test profile:', pErr);
    return;
  }

  const testUser = profiles[0];
  console.log(`- Test Profile ID: ${testUser.id} (${testUser.email})`);

  // Simulate Google Places normalized result selection
  const normalizedGooglePlace = {
    streetAddress: '1200 S Pine Island Rd',
    city: 'Plantation',
    state: 'FL',
    postalCode: '33324',
    country: 'United States'
  };

  console.log('Simulating Google Place selection:', normalizedGooglePlace);

  // Update profile via upsert
  const { data: updated, error: uErr } = await client
    .from('profiles')
    .upsert({
      id: testUser.id,
      name: testUser.name || 'Agent Profile',
      address: normalizedGooglePlace.streetAddress,
      city: normalizedGooglePlace.city,
      state: normalizedGooglePlace.state,
      zip_code: normalizedGooglePlace.postalCode,
      country: normalizedGooglePlace.country,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select('id, address, city, state, zip_code, country, business_lines')
    .maybeSingle();

  if (uErr || !updated) {
    console.error('❌ Address persistence failed:', uErr);
    return;
  }

  console.log('\nReturned Database Row:', updated);

  if (
    updated.address === normalizedGooglePlace.streetAddress &&
    updated.city === normalizedGooglePlace.city &&
    updated.state === normalizedGooglePlace.state &&
    updated.zip_code === normalizedGooglePlace.postalCode &&
    updated.country === normalizedGooglePlace.country
  ) {
    console.log('✅ ADDRESS PERSISTENCE TEST PASSED: All address fields persisted and match Google Places normalized output!');
  } else {
    console.error('❌ ADDRESS PERSISTENCE TEST FAILED: Row does not match expected output!');
  }

  // Restore original state
  await client.from('profiles').update({
    address: testUser.address,
    city: testUser.city,
    state: testUser.state,
    zip_code: testUser.zip_code,
    country: testUser.country
  }).eq('id', testUser.id);
  console.log('Restored original address fields.');
}

testAddressPersistence().catch(console.error);
