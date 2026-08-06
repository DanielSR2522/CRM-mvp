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

const serviceClient = createClient(envUrl, envServiceKey);

async function checkRlsPolicies() {
  console.log('=== CHECKING RLS PERMISSIONS FOR AUTHENTICATED USERS ===');

  const testEmail = `test_agent_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true
  });

  if (authErr || !authData.user) {
    console.error('Error creating test user:', authErr);
    return;
  }

  const userId = authData.user.id;
  console.log(`Created temporary auth user for RLS test: ${testEmail} (id: ${userId})`);

  // Create an authenticated Supabase client using user session
  const { data: sessionData, error: signErr } = await serviceClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  let userClient = serviceClient;
  if (sessionData && sessionData.session) {
    let envAnonKey = '';
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    envContent.split('\n').forEach(line => {
      if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) envAnonKey = line.split('=')[1].trim();
    });

    userClient = createClient(envUrl, envAnonKey, {
      global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } }
    });
  }

  // 1. Test SELECT on non-existent profile row via authenticated user client
  console.log('\n--- 1. Testing SELECT .maybeSingle() with authenticated user client ---');
  const { data: selData, error: selErr } = await userClient
    .from('profiles')
    .select('id, business_lines')
    .eq('id', userId)
    .maybeSingle();

  console.log('SELECT result:', { data: selData, error: selErr });

  // 2. Test UPSERT via authenticated user client WITH NOT-NULL name column
  console.log('\n--- 2. Testing UPSERT with authenticated user client (including non-null name) ---');
  const upsertPayload = {
    id: userId,
    email: testEmail,
    name: 'Test Agent',
    first_name: 'Test',
    last_name: 'Agent',
    business_lines: ['health'],
    updated_at: new Date().toISOString()
  };

  const { data: upData, error: upErr } = await userClient
    .from('profiles')
    .upsert(upsertPayload, { onConflict: 'id' })
    .select('id, business_lines')
    .maybeSingle();

  console.log('UPSERT result:', { data: upData, error: upErr });

  if (upData) {
    console.log('✅ RLS PERMISSIONS PASSED! Authenticated user can SELECT & UPSERT own profile row!');
  } else {
    console.error('❌ RLS PERMISSION FAILED! User could not upsert row:', upErr);
  }

  // Clean up test user
  await serviceClient.from('profiles').delete().eq('id', userId);
  await serviceClient.auth.admin.deleteUser(userId);
  console.log('Cleaned up test user.');
}

checkRlsPolicies().catch(console.error);
