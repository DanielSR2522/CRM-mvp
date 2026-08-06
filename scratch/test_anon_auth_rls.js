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

const serviceClient = createClient(envUrl, envServiceKey);
const anonClient = createClient(envUrl, envAnonKey);

async function testRlsPermissions() {
  console.log('=== TESTING RLS POLICIES FOR PROFILES TABLE ===');

  // Try fetching with anon client without auth token
  const { data: anonData, error: anonErr } = await anonClient
    .from('profiles')
    .select('id, business_lines')
    .limit(1);

  console.log('Anon client query without auth session:', { data: anonData, error: anonErr?.message });
}

testRlsPermissions().catch(console.error);
