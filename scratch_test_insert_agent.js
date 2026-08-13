const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsertWithAgentId() {
  console.log('--- Testing Insert into client_documents ---');

  const { data: clients } = await supabase.from('clients').select('id, agent_id').limit(1);
  const client = clients[0];

  // Test 1: Insert with null agent_id
  const payload1 = {
    client_id: client.id,
    agent_id: null,
    display_name: 'Test Doc Null Agent',
    document_type: 'Document',
    original_filename: 'test_null_agent.pdf',
    storage_path: `${client.id}/test_null.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 512,
    module_type: 'supplemental',
    policy_id: null,
  };

  const { data: res1, error: err1 } = await supabase.from('client_documents').insert(payload1).select('*');
  console.log('Insert with null agent_id:', err1 ? err1 : 'SUCCESS');
  if (res1 && res1[0]) await supabase.from('client_documents').delete().eq('id', res1[0].id);

  // Test 2: Insert with client.agent_id
  if (client.agent_id) {
    const payload2 = {
      client_id: client.id,
      agent_id: client.agent_id,
      display_name: 'Test Doc Client Agent',
      document_type: 'Document',
      original_filename: 'test_client_agent.pdf',
      storage_path: `${client.id}/test_client.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 512,
      module_type: 'supplemental',
      policy_id: null,
    };

    const { data: res2, error: err2 } = await supabase.from('client_documents').insert(payload2).select('*');
    console.log('Insert with client.agent_id:', err2 ? err2 : 'SUCCESS');
    if (res2 && res2[0]) await supabase.from('client_documents').delete().eq('id', res2[0].id);
  }
}

testInsertWithAgentId();
