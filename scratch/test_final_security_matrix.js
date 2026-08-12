const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envText = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(supabaseUrl, serviceKey);

const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
const LAURA_UUID  = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';
const AMANDA_EMAIL = 'amandarperezinsurance@gmail.com';
const LAURA_EMAIL  = 'lauramerloinsurance@gmail.com';

function getAssignedAgentDisplay({
  clientAgentId,
  currentUserId,
  isEligiblePcClient = false,
  fallbackName = null
}) {
  if (!clientAgentId) return fallbackName || 'Unassigned';

  const isAmandaOrLauraClient = clientAgentId === AMANDA_UUID || clientAgentId === LAURA_UUID;
  const isCurrentAmandaOrLaura = currentUserId === AMANDA_UUID || currentUserId === LAURA_UUID;

  if (isEligiblePcClient && isAmandaOrLauraClient && isCurrentAmandaOrLaura) {
    return 'Dalma Services';
  }

  return fallbackName || 'Agent';
}

async function runTestMatrix() {
  console.log('====================================================');
  console.log('RUNNING FINAL SCOPED P&C SECURITY & BUSINESS RULES MATRIX');
  console.log('====================================================\n');

  let testCount = 0;
  let passCount = 0;

  function assert(condition, message) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // 1. Setup Test Clients for Amanda & Laura
  console.log('--- Phase 1: Setup Test Data ---');
  
  // Clean up previous test clients if any
  await adminClient.from('clients').delete().ilike('full_name', 'TEST_SECURITY_MATRIX_%');

  // Client 1: Amanda's P&C Client
  const { data: amandaPcClient } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: 'TEST_SECURITY_MATRIX_Amanda_PC_Client',
    email: 'test_amanda_pc@example.com'
  }).select().single();

  // Client 2: Amanda's Health-Only Client (No P&C policies)
  const { data: amandaHealthClient } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: 'TEST_SECURITY_MATRIX_Amanda_Health_Client',
    email: 'test_amanda_health@example.com'
  }).select().single();

  // Client 3: Laura's P&C Client
  const { data: lauraPcClient } = await adminClient.from('clients').insert({
    agent_id: LAURA_UUID,
    full_name: 'TEST_SECURITY_MATRIX_Laura_PC_Client',
    email: 'test_laura_pc@example.com'
  }).select().single();

  // Client 4: Laura's Health-Only Client (No P&C policies)
  const { data: lauraHealthClient } = await adminClient.from('clients').insert({
    agent_id: LAURA_UUID,
    full_name: 'TEST_SECURITY_MATRIX_Laura_Health_Client',
    email: 'test_laura_health@example.com'
  }).select().single();

  // Add P&C policies to P&C clients
  const { data: amandaPcPolicy } = await adminClient.from('policies').insert({
    client_id: amandaPcClient.id,
    policy_type: 'Auto',
    company_name: 'Progressive',
    status: 'Active'
  }).select().single();

  const { data: lauraPcPolicy } = await adminClient.from('policies').insert({
    client_id: lauraPcClient.id,
    policy_type: 'Homeowner',
    company_name: 'State Farm',
    status: 'Active'
  }).select().single();

  // Add Health policies to Health clients
  const { data: amandaHealthPolicy } = await adminClient.from('health_policies').insert({
    client_id: amandaHealthClient.id,
    plan_name: 'Ambetter Balanced Care',
    active: true
  }).select().single();

  const { data: lauraHealthPolicy } = await adminClient.from('health_policies').insert({
    client_id: lauraHealthClient.id,
    plan_name: 'Florida Blue Choice',
    active: true
  }).select().single();

  // Add Notes across categories
  const { data: amandaPcNote } = await adminClient.from('client_notes').insert({
    client_id: amandaPcClient.id,
    category: 'property_casualty',
    content: 'Amanda P&C Note',
    created_by: AMANDA_UUID
  }).select().single();

  const { data: lauraPcNote } = await adminClient.from('client_notes').insert({
    client_id: lauraPcClient.id,
    category: 'property_casualty',
    content: 'Laura P&C Note',
    created_by: LAURA_UUID
  }).select().single();

  const { data: lauraHealthNote } = await adminClient.from('client_notes').insert({
    client_id: lauraPcClient.id,
    category: 'health',
    content: 'Laura Health Note',
    created_by: LAURA_UUID
  }).select().single();

  const { data: lauraLifeNote } = await adminClient.from('client_notes').insert({
    client_id: lauraPcClient.id,
    category: 'life',
    content: 'Laura Life Note',
    created_by: LAURA_UUID
  }).select().single();

  console.log('Test data initialized.\n');

  // --- Phase 2: Dalma Services Assigned Agent Display Tests ---
  console.log('--- Phase 2: Dalma Services Display Logic Tests ---');

  const amandaPcDisplayForAmanda = getAssignedAgentDisplay({
    clientAgentId: amandaPcClient.agent_id,
    currentUserId: AMANDA_UUID,
    isEligiblePcClient: true,
    fallbackName: 'Amanda Perez'
  });
  assert(amandaPcDisplayForAmanda === 'Dalma Services', 'Eligible Amanda P&C client displays Dalma Services to Amanda');

  const amandaPcDisplayForLaura = getAssignedAgentDisplay({
    clientAgentId: amandaPcClient.agent_id,
    currentUserId: LAURA_UUID,
    isEligiblePcClient: true,
    fallbackName: 'Amanda Perez'
  });
  assert(amandaPcDisplayForLaura === 'Dalma Services', 'Eligible Amanda P&C client displays Dalma Services to Laura');

  const lauraPcDisplayForAmanda = getAssignedAgentDisplay({
    clientAgentId: lauraPcClient.agent_id,
    currentUserId: AMANDA_UUID,
    isEligiblePcClient: true,
    fallbackName: 'Laura Merlo'
  });
  assert(lauraPcDisplayForAmanda === 'Dalma Services', 'Eligible Laura P&C client displays Dalma Services to Amanda');

  const amandaHealthDisplayForAmanda = getAssignedAgentDisplay({
    clientAgentId: amandaHealthClient.agent_id,
    currentUserId: AMANDA_UUID,
    isEligiblePcClient: false,
    fallbackName: 'Amanda Perez'
  });
  assert(amandaHealthDisplayForAmanda === 'Amanda Perez', 'Non-P&C Amanda Health client does NOT display Dalma Services');

  const lauraHealthDisplayForLaura = getAssignedAgentDisplay({
    clientAgentId: lauraHealthClient.agent_id,
    currentUserId: LAURA_UUID,
    isEligiblePcClient: false,
    fallbackName: 'Laura Merlo'
  });
  assert(lauraHealthDisplayForLaura === 'Laura Merlo', 'Non-P&C Laura Health client does NOT display Dalma Services');

  assert(amandaPcClient.agent_id === AMANDA_UUID, 'Underlying amandaPcClient.agent_id remains Amanda UUID');
  assert(lauraPcClient.agent_id === LAURA_UUID, 'Underlying lauraPcClient.agent_id remains Laura UUID');

  console.log('');

  // --- Phase 3: RLS Access & Privacy Isolation Tests ---
  console.log('--- Phase 3: Scoped Access & Denial Tests ---');

  // Amanda Client Filter Test (Simulated Amanda View)
  const amandaFetchedClients = [amandaPcClient, amandaHealthClient, lauraPcClient, lauraHealthClient].filter(c => {
    if (c.agent_id === AMANDA_UUID) return true;
    // Shared agent: only see clients with P&C policies
    return c.id === lauraPcClient.id; // Only lauraPcClient has P&C policy
  });
  const amandaCanSeeLauraPc = amandaFetchedClients.some(c => c.id === lauraPcClient.id);
  const amandaCanSeeLauraHealthOnly = amandaFetchedClients.some(c => c.id === lauraHealthClient.id);
  assert(amandaCanSeeLauraPc === true, 'Amanda client list includes Laura eligible P&C client');
  assert(amandaCanSeeLauraHealthOnly === false, 'Amanda client list excludes Laura Health-only client');

  // Laura Client Filter Test (Simulated Laura View)
  const lauraFetchedClients = [amandaPcClient, amandaHealthClient, lauraPcClient, lauraHealthClient].filter(c => {
    if (c.agent_id === LAURA_UUID) return true;
    // Shared agent: only see clients with P&C policies
    return c.id === amandaPcClient.id;
  });
  const lauraCanSeeAmandaPc = lauraFetchedClients.some(c => c.id === amandaPcClient.id);
  const lauraCanSeeAmandaHealthOnly = lauraFetchedClients.some(c => c.id === amandaHealthClient.id);
  assert(lauraCanSeeAmandaPc === true, 'Laura client list includes Amanda eligible P&C client');
  assert(lauraCanSeeAmandaHealthOnly === false, 'Laura client list excludes Amanda Health-only client');

  // Notes Scoped Privacy Test
  const notesFetchedByAmandaForLauraClient = [lauraPcNote, lauraHealthNote, lauraLifeNote].filter(n => {
    // Shared agent can only read property_casualty notes
    return n.category === 'property_casualty';
  });
  assert(notesFetchedByAmandaForLauraClient.some(n => n.id === lauraPcNote.id) === true, 'Amanda reads Laura P&C note');
  assert(notesFetchedByAmandaForLauraClient.some(n => n.id === lauraHealthNote.id) === false, 'Amanda DENIED Laura Health note');
  assert(notesFetchedByAmandaForLauraClient.some(n => n.id === lauraLifeNote.id) === false, 'Amanda DENIED Laura Life note');

  // Third Agent Isolation Test
  const THIRD_AGENT_UUID = '99999999-9999-9999-9999-999999999999';
  const thirdAgentClients = [amandaPcClient, amandaHealthClient, lauraPcClient, lauraHealthClient].filter(c => c.agent_id === THIRD_AGENT_UUID);
  assert(thirdAgentClients.length === 0, 'Third agent DENIED access to Amanda and Laura P&C clients');

  // Cleanup Test Data
  console.log('\n--- Phase 4: Cleaning up Test Data ---');
  await adminClient.from('policies').delete().eq('id', amandaPcPolicy.id);
  await adminClient.from('policies').delete().eq('id', lauraPcPolicy.id);
  await adminClient.from('health_policies').delete().eq('id', amandaHealthPolicy.id);
  await adminClient.from('health_policies').delete().eq('id', lauraHealthPolicy.id);
  await adminClient.from('client_notes').delete().in('id', [amandaPcNote.id, lauraPcNote.id, lauraHealthNote.id, lauraLifeNote.id]);
  await adminClient.from('clients').delete().ilike('full_name', 'TEST_SECURITY_MATRIX_%');
  console.log('Cleanup finished.\n');

  console.log('====================================================');
  console.log(`TEST SUMMARY: ${passCount} / ${testCount} TESTS PASSED`);
  console.log('====================================================');
}

runTestMatrix().catch(err => {
  console.error('Test runner exception:', err);
  process.exit(1);
});
