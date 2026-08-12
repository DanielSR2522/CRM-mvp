const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
const LAURA_UUID  = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

async function main() {
  console.log('Inspecting agent_shared_access...');
  const { data: rows, error } = await supabase.from('agent_shared_access').select('*');
  if (error) {
    console.error('Error selecting agent_shared_access:', error);
  } else {
    console.log('Current rows in agent_shared_access:', rows);
  }

  // Check if we can upsert scope
  const { data: upsertData, error: upsertErr } = await supabase
    .from('agent_shared_access')
    .upsert([
      { agent_id: AMANDA_UUID, shared_agent_id: LAURA_UUID, scope: 'property_casualty' },
      { agent_id: LAURA_UUID, shared_agent_id: AMANDA_UUID, scope: 'property_casualty' }
    ], { onConflict: 'agent_id,shared_agent_id' })
    .select();

  if (upsertErr) {
    console.log('Upsert result:', upsertErr.message);
  } else {
    console.log('Upsert successful:', upsertData);
  }
}

main();
