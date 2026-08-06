const fs = require('fs');
const path = require('path');

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

const { getSupabaseAdmin } = require('../src/lib/supabaseAdmin');

async function testHealthInsert() {
  const supabase = getSupabaseAdmin();
  const testAgentId = '4f698c2f-f9e0-42d1-996e-a9ee4a574ea9';

  const { data: c } = await supabase.from('clients').insert({ agent_id: testAgentId, full_name: 'Test HP' }).select('id').single();
  if (c) {
    const { data: hp, error: hpErr } = await supabase.from('health_policies').insert({
      client_id: c.id,
      status: 'active',
      plan_name: 'Test Health Plan'
    }).select('id').single();

    console.log('Health Policy insert:', hp, hpErr);
    await supabase.rpc('delete_client_cascade', { p_client_id: c.id, p_agent_id: testAgentId });
  }
}

testHealthInsert();
