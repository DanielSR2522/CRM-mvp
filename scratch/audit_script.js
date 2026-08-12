const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectProfilesAndRLS() {
  console.log("=== FULL PROFILES TABLE ===");
  const { data: profiles, error } = await supabaseAdmin.from('profiles').select('*');
  console.log(JSON.stringify(profiles, null, 2));

  console.log("\n=== RLS POLICIES FOR CLIENTS TABLE ===");
  // Let's check table policies via RPC or pg catalog if allowed
  const { data: policies, error: polErr } = await supabaseAdmin.rpc('get_policies'); // may or may not exist
  if (polErr) {
    console.log("RPC get_policies not found or error:", polErr.message);
  } else {
    console.log("Policies:", policies);
  }
}

inspectProfilesAndRLS().catch(console.error);
