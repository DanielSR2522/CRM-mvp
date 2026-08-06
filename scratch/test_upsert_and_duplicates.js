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

async function testUpsertAndDuplicates() {
  console.log('===========================================================');
  console.log('1. CHECKING FOR DUPLICATE PROFILE ROWS BY ID OR EMAIL');
  console.log('===========================================================');

  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select('id, email, name, business_lines');

  if (pErr) {
    console.error('Error fetching profiles:', pErr);
    return;
  }

  const idMap = {};
  const emailMap = {};
  let duplicatesFound = false;

  profiles.forEach(p => {
    if (idMap[p.id]) {
      console.error(`DUPLICATE ID FOUND: ${p.id}`);
      duplicatesFound = true;
    } else {
      idMap[p.id] = p;
    }

    if (p.email) {
      if (emailMap[p.email]) {
        console.warn(`DUPLICATE EMAIL FOUND across different profile IDs: ${p.email}`);
        duplicatesFound = true;
      } else {
        emailMap[p.email] = p;
      }
    }
  });

  if (!duplicatesFound) {
    console.log('✅ No duplicate profile rows found in public.profiles table.');
  }

  console.log('\n===========================================================');
  console.log('2. TESTING UPSERT FOR NEW USER ID WITHOUT PROFILE');
  console.log('===========================================================');

  // Pick an auth user without a profile row
  const { data: { users } } = await client.auth.admin.listUsers();
  const userWithoutProfile = users.find(u => !idMap[u.id]);

  if (userWithoutProfile) {
    console.log(`Testing upsert for user without profile: ${userWithoutProfile.email} (id: ${userWithoutProfile.id})`);

    // Test maybeSingle query first
    const { data: maybeData, error: maybeErr } = await client
      .from('profiles')
      .select('*')
      .eq('id', userWithoutProfile.id)
      .maybeSingle();

    console.log('maybeSingle result on non-existent profile:', { data: maybeData, error: maybeErr });

    // Perform upsert
    const upsertPayload = {
      id: userWithoutProfile.id,
      email: userWithoutProfile.email,
      name: 'Test Agent',
      business_lines: ['health'],
      updated_at: new Date().toISOString()
    };

    const { data: upsertData, error: upsertErr } = await client
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'id' })
      .select('id, business_lines')
      .single();

    console.log('Upsert result:', { data: upsertData, error: upsertErr });
    if (upsertData) {
      console.log('✅ UPSERT SUCCESSFUL! Created profile row for new user cleanly without coercion error.');

      // Clean up test profile row
      await client.from('profiles').delete().eq('id', userWithoutProfile.id);
      console.log('Cleaned up test profile row.');
    }
  } else {
    console.log('All auth users already have profile rows.');
  }
}

testUpsertAndDuplicates().catch(console.error);
