const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local','utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const AMANDA = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
  const LAURA  = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id,agent_id')
    .in('agent_id',[AMANDA,LAURA]);

  if (error) throw error;

  for (const c of clients) {
    const results = {};

    for (const table of ['health_policies','life_policies','policies']) {
      const { count, error } = await supabase
        .from(table)
        .select('*',{ count:'exact', head:true })
        .eq('client_id',c.id);

      results[table] = error ? 'ERR' : count;
    }

    if (
      results.health_policies > 0 ||
      results.life_policies > 0 ||
      results.policies > 0
    ) {
      console.log({
        client_id: c.id,
        owner: c.agent_id === AMANDA ? 'AMANDA' : 'LAURA',
        ...results
      });
    }
  }
}

run().catch(e => console.error('ERROR:',e.message));
