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

async function testRlsPerAgent() {
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
  const { data: clients } = await supabaseAdmin.from('clients').select('*, policies(id), health_policies(id), life_policies(id)');
  const { data: sharedAccess } = await supabaseAdmin.from('agent_shared_access').select('*');

  console.log("=== SHARED ACCESS PAIRS IN DB ===");
  console.log(sharedAccess);

  console.log("\n=== OWNERSHIP & POLICY BREAKDOWN BY AGENT ===");
  for (const prof of profiles) {
    const ownedClients = clients.filter(c => c.agent_id === prof.id);
    const ownedWithPC = ownedClients.filter(c => c.policies && c.policies.length > 0);
    const ownedWithoutPC = ownedClients.filter(c => !c.policies || c.policies.length === 0);
    const ownedWithHealth = ownedClients.filter(c => c.health_policies && c.health_policies.length > 0);
    const ownedWithLife = ownedClients.filter(c => c.life_policies && c.life_policies.length > 0);

    console.log(`\nAgent: ${prof.name} (${prof.email}) [ID: ${prof.id}]`);
    console.log(`  - Total owned clients: ${ownedClients.length}`);
    console.log(`  - Clients WITH P&C policy: ${ownedWithPC.length}`);
    console.log(`  - Clients WITHOUT P&C policy: ${ownedWithoutPC.length}`);
    console.log(`  - Clients WITH Health policy: ${ownedWithHealth.length}`);
    console.log(`  - Clients WITH Life policy: ${ownedWithLife.length}`);

    if (ownedWithoutPC.length > 0) {
      console.log(`  - Clients without P&C policy (invisible to shared P&C agents like Amanda/Laura):`);
      ownedWithoutPC.forEach(c => console.log(`      * ID: ${c.id} | Name: "${c.full_name}" | Health: ${c.health_policies?.length || 0} | Life: ${c.life_policies?.length || 0}`));
    }
  }
}

testRlsPerAgent().catch(console.error);
