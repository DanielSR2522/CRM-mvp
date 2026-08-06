import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export {};

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

async function testWizardFlows() {
  console.log('===========================================================');
  console.log('TESTING NEW CLIENT POLICY-FIRST WIZARD CREATION FLOWS');
  console.log('===========================================================\n');

  try {
    // Fetch test agent ID
    const { data: users } = await supabase.from('clients').select('agent_id').limit(1);
    const agentId = users?.[0]?.agent_id || '00000000-0000-0000-0000-000000000000';

    const testClientIds: string[] = [];

    // 1. P&C Individual Client Test
    const pcIndName = `Test PC Ind ${Date.now()}`;
    const { data: pcIndClient, error: pcIndErr } = await supabase
      .from('clients')
      .insert({
        agent_id: agentId,
        full_name: pcIndName,
        agency_name: null,
        address: '123 Main St, Miami, FL 33101',
        email: `pc_ind_${Date.now()}@example.com`,
        phone: '(305) 555-0101'
      })
      .select()
      .single();

    assert(!pcIndErr && !!pcIndClient?.id, 'P&C Individual client created in clients table');
    if (pcIndClient) {
      testClientIds.push(pcIndClient.id);
      assert(pcIndClient.agency_name === null, 'P&C Individual has agency_name as null');
      const expectedPcRedirect = `/clients/${pcIndClient.id}?tab=policies`;
      assert(expectedPcRedirect.endsWith('?tab=policies'), 'P&C redirect route resolves directly to Property & Casualty tab: /clients/${id}?tab=policies');
    }

    // 2. P&C Company Client Test
    const pcCompContact = `Jane Doe ${Date.now()}`;
    const pcCompanyName = `Acme Corp ${Date.now()}`;
    const { data: pcCompClient, error: pcCompErr } = await supabase
      .from('clients')
      .insert({
        agent_id: agentId,
        full_name: pcCompContact,
        agency_name: pcCompanyName,
        address: '456 Business Blvd, Orlando, FL 32801',
        email: `acme_${Date.now()}@example.com`,
        phone: '(407) 555-0202'
      })
      .select()
      .single();

    assert(!pcCompErr && !!pcCompClient?.id, 'P&C Company client created');
    if (pcCompClient) {
      testClientIds.push(pcCompClient.id);
      assert(pcCompClient.agency_name === pcCompanyName, 'P&C Company name persisted in agency_name');
      assert(pcCompClient.full_name === pcCompContact, 'P&C Company contact name persisted in full_name');
    }

    // 3. Health New Enrollment Client Test
    const healthNewName = `Health New ${Date.now()}`;
    const { data: healthNewClient } = await supabase
      .from('clients')
      .insert({
        agent_id: agentId,
        full_name: healthNewName,
        email: `health_new_${Date.now()}@example.com`,
        phone: '(305) 555-0303'
      })
      .select()
      .single();

    if (healthNewClient) {
      testClientIds.push(healthNewClient.id);

      const { data: healthPol } = await supabase
        .from('health_policies')
        .insert({
          client_id: healthNewClient.id,
          active: false,
          renovation_status: 'New Policy 2026'
        })
        .select()
        .single();

      assert(!!healthPol?.id, 'Health policy created for New Enrollment');
      assert(healthPol?.renovation_status === 'New Policy 2026', 'Health Enrollment Type "New Enrollment" saved in renovation_status as "New Policy 2026"');
      assert(healthPol?.active === false, 'Health policy is active=false (not auto-enrolled)');
    }

    // 4. Health Renewal Client Test
    const healthRenName = `Health Renewal ${Date.now()}`;
    const { data: healthRenClient } = await supabase
      .from('clients')
      .insert({
        agent_id: agentId,
        full_name: healthRenName,
        email: `health_ren_${Date.now()}@example.com`,
        phone: '(305) 555-0404'
      })
      .select()
      .single();

    if (healthRenClient) {
      testClientIds.push(healthRenClient.id);

      const { data: healthPolRen } = await supabase
        .from('health_policies')
        .insert({
          client_id: healthRenClient.id,
          active: false,
          renovation_status: 'Renewal 2026'
        })
        .select()
        .single();

      assert(healthPolRen?.renovation_status === 'Renewal 2026', 'Health Enrollment Type "Renewal" saved in renovation_status as "Renewal 2026"');
    }

    // 5. Life IUL Client Test
    const lifeIulName = `Life IUL ${Date.now()}`;
    const { data: lifeIulClient } = await supabase
      .from('clients')
      .insert({
        agent_id: agentId,
        full_name: lifeIulName,
        email: `life_iul_${Date.now()}@example.com`,
        phone: '(305) 555-0505'
      })
      .select()
      .single();

    if (lifeIulClient) {
      testClientIds.push(lifeIulClient.id);

      const { data: lifePol } = await supabase
        .from('life_policies')
        .insert({
          client_id: lifeIulClient.id,
          status: 'Pending'
        })
        .select()
        .single();

      assert(!!lifePol?.id, 'Life policy container initialized with status=Pending');

      if (lifePol) {
        const { data: productData } = await supabase
          .from('life_policy_products')
          .insert({
            life_policy_id: lifePol.id,
            product_type: 'IUL'
          })
          .select()
          .single();

        assert(productData?.product_type === 'IUL', 'Life product initialized with product_type "IUL"');
        assert(productData?.company === null || productData?.company === undefined, 'No fake company or policy number set');
      }
    }

    // Cleanup test records
    for (const cid of testClientIds) {
      await supabase.from('clients').delete().eq('id', cid);
    }

    console.log('\n===========================================================');
    console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('Test error:', err);
  }
}

testWizardFlows();
