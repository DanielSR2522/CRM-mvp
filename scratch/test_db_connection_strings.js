const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '').trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Project Ref:', projectRef);
console.log('Service Key length:', serviceKey ? serviceKey.length : 0);

// Let's test calling RPC or applying SQL via custom REST / RPC handler
const { getSupabaseAdmin } = require('../src/lib/supabaseAdmin');

async function testApplyRPC() {
  const supabase = getSupabaseAdmin();
  const migrationSql = fs.readFileSync(path.join(__dirname, '../migration_client_deletion_rpc.sql'), 'utf8');

  // Let's test if we can execute DDL or if we can run statements
  console.log('Testing SQL migration application via Supabase Admin...');
  
  // Split migration SQL into key blocks:
  // 1. ALTER TABLE
  // 2. CREATE FUNCTION signature_requests_guard_delete
  // 3. DROP/CREATE TRIGGER
  // 4. CREATE FUNCTION delete_client_cascade
  
  // Note: If direct SQL endpoint is available or RPC exists, let's test it.
  try {
    const { data, error } = await supabase.rpc('delete_client_cascade', { p_client_id: '00000000-0000-0000-0000-000000000000', p_agent_id: '00000000-0000-0000-0000-000000000000' });
    if (error) {
      console.log('RPC check result:', error.code, error.message);
    } else {
      console.log('RPC is already installed! Result:', data);
    }
  } catch (err) {
    console.log('RPC error:', err.message);
  }
}

testApplyRPC();
