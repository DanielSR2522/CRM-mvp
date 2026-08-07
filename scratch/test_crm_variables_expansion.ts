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

async function runFinalCorrectnessAudit() {
  const { buildMergeData, substitute, findUnresolvedVariables, buildMergeSnapshot } = await import('../src/lib/consents/merge-service');
  const { VARIABLE_REGISTRY, TOKEN_LOOKUP } = await import('../src/lib/consents/variable-registry');

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
  console.log('FINAL CORRECTNESS AUDIT: EXPANDED CONSENT VARIABLE REGISTRY');
  console.log('===========================================================\n');

  // 1. Audit Token Mappings & Removed Unsupported Variables
  console.log('--- 1. Token Mappings & Unsupported Variables Audit ---');
  assert(TOKEN_LOOKUP['health.expiration_date'] === undefined, 'health.expiration_date removed (unsupported in health_policies schema)');
  assert(TOKEN_LOOKUP['client.company_name'] === undefined, 'client.company_name removed (unsupported on client record)');
  assert(TOKEN_LOOKUP['agent.npn'] !== undefined, 'agent.npn exists and maps to profiles.npn_number');
  assert(TOKEN_LOOKUP['client.total_income'] !== undefined, 'client.total_income maps strictly to health_policies.household_income');

  // Mock Base Client
  const mockClient: any = {
    client_id: 'client-123',
    agent_id: 'agent-456',
    full_name: 'Maria Elena Pabon',
    email: 'maria@example.com',
    phone: '(305) 555-0148',
    date_of_birth: '1985-04-17',
    ssn: '123456789',
    address: '820 NW 12th Ave',
    city: 'Miami',
    state: 'FL',
    zip_code: '33136',
    county: 'Miami-Dade',
    agent_info: {
      full_name: 'Sebastian Gomez',
      first_name: 'Sebastian',
      last_name: 'Gomez',
      email: 'agent@sunstate.com',
      phone: '(305) 555-0100',
      agency_name: 'Sunstate Insurance',
      npn: '19827461',
      license_number: 'FL-W382910',
      license_state: 'FL',
    }
  };

  // 2. Client WITH Income vs Client WITHOUT Income
  console.log('\n--- 2. Income Mapping Audit (Strict Household Income Only) ---');
  const healthPolicyWithIncome: any = {
    policy_id: 'hp-1',
    client_id: 'client-123',
    category: 'health',
    plan_name: 'Florida Blue Silver 1410',
    household_income: 48000.00,
    monthly_premium: 95.00,
  };

  const valuesWithIncome = buildMergeData(mockClient, healthPolicyWithIncome);
  assert(valuesWithIncome['client.total_income'] === '$48,000.00', 'Client total income resolves strictly to stored $48,000.00');
  assert(valuesWithIncome['health.household_income'] === '$48,000.00', 'Health household income resolves to $48,000.00');
  assert(valuesWithIncome['health.monthly_premium'] === '$95.00', 'Monthly premium resolves to $95.00 without polluting income');

  const healthPolicyNoIncome: any = {
    policy_id: 'hp-2',
    client_id: 'client-123',
    category: 'health',
    plan_name: 'Florida Blue Bronze',
    household_income: null, // Income missing!
    monthly_premium: 150.00,
  };

  const valuesNoIncome = buildMergeData(mockClient, healthPolicyNoIncome);
  assert(valuesNoIncome['client.total_income'] === undefined, 'Missing household_income returns undefined (NEVER calculates from plan_cost!)');
  assert(valuesNoIncome['health.household_income'] === undefined, 'Missing health.household_income returns undefined');

  // 3. Dynamic Tax Members (1 member vs 4 members)
  console.log('\n--- 3. Dynamic Health Tax Members Audit ---');
  const healthPolicy4Members: any = {
    policy_id: 'hp-3',
    client_id: 'client-123',
    category: 'health',
    plan_name: 'Ambetter Balanced Care',
    tax_members: [
      { full_name: 'Maria Pabon', date_of_birth: '1985-04-17', relationship: 'Self' },
      { full_name: 'Carlos Pabon', date_of_birth: '1983-09-12', relationship: 'Spouse' },
      { full_name: 'Sofia Pabon', date_of_birth: '2012-01-05', relationship: 'Dependent' },
      { full_name: 'Mateo Pabon', date_of_birth: '2015-06-20', relationship: 'Dependent' },
    ]
  };

  const values4Members = buildMergeData(mockClient, healthPolicy4Members);
  assert(values4Members['health.tax_members_count'] === '4', 'Dynamic tax members count resolves to 4');
  assert(values4Members['health.tax_members_names'] === 'Maria Pabon (Self), Carlos Pabon (Spouse), Sofia Pabon (Dependent), Mateo Pabon (Dependent)', 'Tax members names join all 4 members correctly');
  assert(values4Members['health.tax_member_1.full_name'] === 'Maria Pabon', 'Member 1 full name resolves correctly');
  assert(values4Members['health.tax_member_4.full_name'] === 'Mateo Pabon', 'Member 4 full name resolves dynamically');

  // 4. Agent NPN Populated vs Missing
  console.log('\n--- 4. Agent NPN Source Verification ---');
  assert(valuesWithIncome['agent.npn'] === '19827461', 'Agent NPN populated from profiles.npn_number');

  const mockClientNoNpn: any = {
    ...mockClient,
    agent_info: {
      ...mockClient.agent_info,
      npn: null,
    }
  };
  const valuesNoNpn = buildMergeData(mockClientNoNpn, healthPolicyWithIncome);
  assert(valuesNoNpn['agent.npn'] === undefined, 'Missing Agent NPN returns undefined without throwing');

  // 5. Multiple Health Policy Context & Snapshot Persistence
  console.log('\n--- 5. Multiple Health Policy Context & Snapshot Audit ---');
  const snapshot = buildMergeSnapshot(
    valuesWithIncome,
    [],
    'client-123',
    'hp-1', // Preserved explicit health policy id
    'I agree to sign.'
  );
  assert(snapshot.sources.policy_id === 'hp-1', 'Selected health_policy_id is preserved in snapshot.sources.policy_id');
  assert(snapshot.sources.client_id === 'client-123', 'Selected client_id is preserved in snapshot.sources.client_id');

  // 6. P&C Policy & Life Product Resolution
  console.log('\n--- 6. P&C Policy & Life Product Audit ---');
  const pcPolicy: any = {
    policy_id: 'pc-100',
    client_id: 'client-123',
    category: 'pc',
    policy_number: 'AUTO-99812',
    policy_type: 'Personal Auto',
    company_name: 'Geico',
    full_premium: 1200.00,
    monthly_premium: 100.00,
    payment_frequency: 'Monthly',
  };
  const pcValues = buildMergeData(mockClient, pcPolicy);
  assert(pcValues['pc.policy_number'] === 'AUTO-99812', 'P&C policy number resolves correctly');
  assert(pcValues['pc.monthly_premium'] === '$100.00', 'P&C monthly premium resolves to $100.00');
  assert(pcValues['pc.term'] === 'Monthly', 'P&C term resolves to Monthly payment frequency');

  const lifePolicy: any = {
    policy_id: 'life-200',
    client_id: 'client-123',
    category: 'life',
    policy_number: 'LIF-55410',
    product_type: 'Whole Life',
    company_name: 'Prudential',
    status: 'Active',
    face_amount: 500000.00,
    monthly_premium: 120.00,
  };
  const lifeValues = buildMergeData(mockClient, lifePolicy);
  assert(lifeValues['life.status'] === 'Active', 'Life policy status resolves to Active');
  assert(lifeValues['life.face_amount'] === '$500,000.00', 'Life face amount resolves to $500,000.00');

  console.log('\n===========================================================');
  console.log(`FINAL AUDIT RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runFinalCorrectnessAudit();
