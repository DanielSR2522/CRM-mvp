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

async function runSendFlowRegressionTests() {
  const { renderTemplateContent, findUnresolvedVariables, buildMergeData, createCanonicalContentHash } = await import('../src/lib/consents/merge-service');
  const { contentToHtml, extractVariables, normalizeContent } = await import('../src/lib/consents/template-blocks');

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

  console.log('===========================================================');
  console.log('REGRESSION TEST SUITE: CONSENT SEND-FLOW RUNTIME FIX');
  console.log('===========================================================\n');

  const mockClient: any = {
    client_id: 'client-123',
    agent_id: 'agent-456',
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '(305) 555-0100',
    date_of_birth: '1990-01-01',
    address: '123 Main St',
    city: 'Miami',
    state: 'FL',
    zip_code: '33101',
    agent_info: {
      full_name: 'Jane Agent',
      npn: '12345678',
    }
  };

  const values = buildMergeData(mockClient, null);

  // 1. Legacy published template with blocks
  console.log('--- Scenario 1: Legacy Published Template with Blocks ---');
  const legacyContent: any = {
    blocks: [
      { id: 'b1', type: 'heading', level: 1, text: 'Consent Document' },
      { id: 'b2', type: 'paragraph', text: 'Client Name: {{client.full_name}}' },
    ]
  };
  try {
    const renderedLegacy = renderTemplateContent(legacyContent, values);
    assert(Array.isArray(renderedLegacy.blocks) && renderedLegacy.blocks.length === 2, 'Legacy block template renders without error');
    assert((renderedLegacy.blocks[1] as any).text === 'Client Name: John Doe', 'Legacy variable {{client.full_name}} resolves to John Doe');
  } catch (err: any) {
    assert(false, `Legacy template rendering threw error: ${err?.message}`);
  }

  // 2. New rich-text published template with HTML
  console.log('\n--- Scenario 2: New Rich-Text Published Template with HTML ---');
  const newHtmlContent: any = {
    html: '<h1>Consent Document</h1><p>Client Name: {{client.full_name}}</p>',
    signing_config: { require_signature: true }
  };
  try {
    const renderedHtml = renderTemplateContent(newHtmlContent, values);
    assert(renderedHtml.html === '<h1>Consent Document</h1><p>Client Name: John Doe</p>', 'New HTML template renders without error');
    assert(Array.isArray(renderedHtml.blocks), 'renderedHtml.blocks is safely defined as an array');
  } catch (err: any) {
    assert(false, `New HTML template rendering threw error: ${err?.message}`);
  }

  // 3. Template with variables_used undefined or null
  console.log('\n--- Scenario 3: Template with variables_used Undefined/Null ---');
  try {
    const unresolvedNull = findUnresolvedVariables(null as any, values, false);
    const unresolvedUndef = findUnresolvedVariables(undefined as any, values, false);
    assert(Array.isArray(unresolvedNull) && unresolvedNull.length === 0, 'variables_used=null safely returns empty unresolved array without throwing');
    assert(Array.isArray(unresolvedUndef) && unresolvedUndef.length === 0, 'variables_used=undefined safely returns empty unresolved array without throwing');
  } catch (err: any) {
    assert(false, `findUnresolvedVariables threw error: ${err?.message}`);
  }

  // 4. Template with NO policy selected (only client variables)
  console.log('\n--- Scenario 4: Template with No Policy Selected ---');
  try {
    const clientVars = ['client.full_name', 'agent.full_name', 'system.current_date'];
    const unresolvedNoPolicy = findUnresolvedVariables(clientVars, values, false);
    assert(unresolvedNoPolicy.length === 0, 'No policy tokens -> 0 unresolved variables when policy=null');
  } catch (err: any) {
    assert(false, `No policy scenario threw error: ${err?.message}`);
  }

  // 5. Template requiring Health policy
  console.log('\n--- Scenario 5: Template Requiring Health Policy ---');
  try {
    const healthVars = ['client.full_name', 'health.plan_name'];
    const unresolvedHealthNoPolicy = findUnresolvedVariables(healthVars, values, false);
    assert(unresolvedHealthNoPolicy.length === 1 && unresolvedHealthNoPolicy[0].token === 'health.plan_name' && unresolvedHealthNoPolicy[0].needsPolicy === true, 'Health token correctly flags needsPolicy=true when policy=null');

    const healthPolicy: any = { policy_id: 'hp-1', category: 'health', plan_name: 'Silver 100', client_id: 'client-123' };
    const healthValues = buildMergeData(mockClient, healthPolicy);
    const unresolvedHealthWithPolicy = findUnresolvedVariables(healthVars, healthValues, true);
    assert(unresolvedHealthWithPolicy.length === 0, 'Health token resolves cleanly when Health policy is attached');
  } catch (err: any) {
    assert(false, `Health policy scenario threw error: ${err?.message}`);
  }

  // 6. Template requiring P&C policy
  console.log('\n--- Scenario 6: Template Requiring P&C Policy ---');
  try {
    const pcVars = ['pc.policy_number'];
    const unresolvedPcNoPolicy = findUnresolvedVariables(pcVars, values, false);
    assert(unresolvedPcNoPolicy.length === 1 && unresolvedPcNoPolicy[0].token === 'pc.policy_number' && unresolvedPcNoPolicy[0].needsPolicy === true, 'P&C token flags needsPolicy=true when policy=null');

    const pcPolicy: any = { policy_id: 'pc-1', category: 'pc', policy_number: 'AUTO-123', client_id: 'client-123' };
    const pcValues = buildMergeData(mockClient, pcPolicy);
    assert(pcValues['pc.policy_number'] === 'AUTO-123', 'P&C token resolves cleanly when P&C policy is attached');
  } catch (err: any) {
    assert(false, `P&C policy scenario threw error: ${err?.message}`);
  }

  // 7. Template requiring Life policy
  console.log('\n--- Scenario 7: Template Requiring Life Policy ---');
  try {
    const lifeVars = ['life.policy_number'];
    const unresolvedLifeNoPolicy = findUnresolvedVariables(lifeVars, values, false);
    assert(unresolvedLifeNoPolicy.length === 1 && unresolvedLifeNoPolicy[0].token === 'life.policy_number' && unresolvedLifeNoPolicy[0].needsPolicy === true, 'Life token flags needsPolicy=true when policy=null');

    const lifePolicy: any = { policy_id: 'life-1', category: 'life', policy_number: 'LIF-999', client_id: 'client-123' };
    const lifeValues = buildMergeData(mockClient, lifePolicy);
    assert(lifeValues['life.policy_number'] === 'LIF-999', 'Life token resolves cleanly when Life policy is attached');
  } catch (err: any) {
    assert(false, `Life policy scenario threw error: ${err?.message}`);
  }

  console.log('\n===========================================================');
  console.log(`REGRESSION AUDIT RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runSendFlowRegressionTests();
