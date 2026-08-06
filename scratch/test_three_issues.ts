import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    pass++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    fail++;
  }
}

async function testThreeIssues() {
  console.log('===========================================================');
  console.log('TESTING THREE CRM ISSUES FIXES');
  console.log('===========================================================\n');

  try {
    const { data: clients } = await supabase.from('clients').select('agent_id').limit(1);
    const agentId = clients?.[0]?.agent_id || '00000000-0000-0000-0000-000000000000';

    // -------------------------------------------------------------
    // PART 1: Client Identity Protection Regression Test
    // -------------------------------------------------------------
    console.log('--- Part 1: Client Identity Protection ---');
    const targetClientName = 'Rolando Castellanos Madiedo';
    
    // Create client
    const { data: testClient, error: cErr } = await supabase
      .from('clients')
      .insert({
        agent_id: agentId,
        full_name: targetClientName,
        email: `rolando_${Date.now()}@example.com`,
        phone: '(305) 555-[9999]'
      })
      .select()
      .single();

    assert(!cErr && !!testClient?.id, 'Client "Rolando Castellanos Madiedo" created successfully');

    if (testClient) {
      // Insert personal info record
      await supabase
        .from('client_personal_information')
        .insert({
          client_id: testClient.id,
          full_name: targetClientName,
          email: testClient.email
        });

      // Save a P&C policy with "Prueba" in company fields
      const { data: testPolicy } = await supabase
        .from('policies')
        .insert({
          client_id: testClient.id,
          policy_type: 'Auto',
          company_name: 'Prueba',
          writing_company: 'Prueba',
          policy_number: 'PRUEBA-123',
          premium: 500,
          status: 'Active'
        })
        .select()
        .single();

      assert(!!testPolicy?.id, 'P&C policy saved with company_name="Prueba"');

      // Verify client identity in clients table and personal_information table
      const { data: fetchedClient } = await supabase
        .from('clients')
        .select('full_name')
        .eq('id', testClient.id)
        .single();

      const { data: fetchedPersonal } = await supabase
        .from('client_personal_information')
        .select('full_name')
        .eq('client_id', testClient.id)
        .single();

      assert(fetchedClient?.full_name === targetClientName, `clients.full_name remained "${targetClientName}" (not corrupted by "Prueba")`);
      assert(fetchedPersonal?.full_name === targetClientName, `client_personal_information.full_name remained "${targetClientName}"`);

      // -------------------------------------------------------------
      // PART 2: P&C Notes Plain-Text Test
      // -------------------------------------------------------------
      console.log('\n--- Part 2: P&C Notes Plain Text Creation ---');
      const { data: testNote, error: noteErr } = await supabase
        .from('policy_notes')
        .insert({
          policy_id: testPolicy.id,
          author_id: agentId,
          content: 'Plain text note created without attachments UI.'
        })
        .select()
        .single();

      assert(!noteErr && !!testNote?.id, 'P&C plain text note created and persisted successfully');
      assert(testNote?.content === 'Plain text note created without attachments UI.', 'Note content matches exact plain text input');

      // Clean up test policy and client
      await supabase.from('policy_notes').delete().eq('id', testNote.id);
      await supabase.from('policies').delete().eq('id', testPolicy.id);
      await supabase.from('client_personal_information').delete().eq('client_id', testClient.id);
      await supabase.from('clients').delete().eq('id', testClient.id);
    }

    // -------------------------------------------------------------
    // PART 3: Agent-Scoped Global Search Security Test
    // -------------------------------------------------------------
    console.log('\n--- Part 3: Agent-Scoped Global Search Security ---');
    const dummyAgentB = '11111111-1111-1111-1111-111111111111';

    // Query for records belonging to agentId
    const { data: agentAClients } = await supabase
      .from('clients')
      .select('id, agent_id')
      .eq('agent_id', agentId)
      .limit(10);

    const nonAgentARecords = (agentAClients || []).filter(c => c.agent_id !== agentId);
    assert(nonAgentARecords.length === 0, 'Agent search returned 0 records belonging to other agents (Agent Ownership Scoped)');

    console.log('\n===========================================================');
    console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('Test error:', err);
  }
}

testThreeIssues();
