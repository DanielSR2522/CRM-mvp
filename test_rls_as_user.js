const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create client with ANON key (same as browser!)
const supabase = createClient(supabaseUrl, anonKey);

async function testUserSession() {
  console.log('=== TESTING SUPABASE ANON QUERY WITHOUT AUTH SESSION ===');
  const { data: anonData, count: anonCount, error: anonErr } = await supabase
    .from('clients')
    .select('*', { count: 'exact' });

  console.log('Anon query count:', anonCount, 'rows:', anonData?.length, 'Error:', anonErr);

  console.log('=== TESTING WITH SIGN IN (Daniel Rodriguez: danisanti32_@hotmail.com) ===');
  // Attempt signInWithPassword if password is known, or generate a magic link/session
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: 'danisanti32_@hotmail.com',
    });

    if (linkData?.properties?.hashed_token) {
      // Verify OTP to get user session on anon client
      const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
        email: 'danisanti32_@hotmail.com',
        token: linkData.properties.verification_type,
        type: 'magiclink',
        token_hash: linkData.properties.hashed_token,
      });

      console.log('Session verified:', !!sessionData?.session, 'Session user ID:', sessionData?.user?.id);

      if (sessionData?.session) {
        // Now query clients table as authenticated user!
        const { data: userClients, count: userCount, error: userErr } = await supabase
          .from('clients')
          .select('*', { count: 'exact' });

        console.log('Authenticated User clients count:', userCount, 'rows:', JSON.stringify(userClients, null, 2), 'Error:', userErr);
      }
    } else {
      console.log('Magic link error:', linkErr);
    }
  }
}

testUserSession();
