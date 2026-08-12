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

async function findOrphanedAgentIds() {
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, name, email');
  const profileIds = new Set(profiles.map(p => p.id));

  const { data: clients } = await supabaseAdmin.from('clients').select('*');
  
  console.log("=== CLIENTS WITH AGENT_ID NOT IN PROFILES TABLE ===");
  const unknownAgentClients = clients.filter(c => !profileIds.has(c.agent_id));
  console.log(`Found ${unknownAgentClients.length} clients:`);
  unknownAgentClients.forEach(c => {
    console.log(`  - Client ID: ${c.id} | Name: "${c.full_name}" | agent_id: ${c.agent_id} | Created: ${c.created_at}`);
  });

  console.log("\n=== ALL 70 CLIENTS DUMP (SUMMARY) ===");
  clients.forEach((c, idx) => {
    const prof = profiles.find(p => p.id === c.agent_id);
    const agentLabel = prof ? `${prof.name} (${prof.email})` : `[UNKNOWN/DELETED AGENT ${c.agent_id}]`;
    console.log(`${idx+1}. "${c.full_name}" | ID: ${c.id} | Type: ${c.client_type} | Agent: ${agentLabel}`);
  });
}

findOrphanedAgentIds().catch(console.error);
