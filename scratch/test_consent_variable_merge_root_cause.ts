process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

import { extractVariables, normalizeVariableDelimiters, normalizeContent } from '../src/lib/consents/template-blocks';
import { buildMergeData, substitute, renderTemplateContent, findUnresolvedVariables } from '../src/lib/consents/merge-service';
import type { ClientMergeData, PolicyMergeData } from '../src/lib/consents/types';

async function runTests() {
  console.log('=== CONSENT VARIABLE MERGE ROOT CAUSE & BACKWARD COMPATIBILITY REGRESSION SUITE ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Client & Agent Merge Data Structure & Resolution Order
  // ---------------------------------------------------------------------------
  const mockClientData: ClientMergeData = {
    client_id: 'client-123',
    agent_id: 'agent-456',
    full_name: 'Maria Elena Pabon',
    email: 'maria.personal@example.com', // Resolved preferentially from client_personal_information
    phone: '(305) 555-0148',            // Resolved preferentially from client_personal_information
    agency_name: 'Sunstate Insurance',
    date_of_birth: '1985-04-17',
    ssn: '123-45-6789',
    secondary_email: 'maria.work@example.com',
    secondary_phone: '(305) 555-0199',
    gender: 'Female',
    marital_status: 'Married',
    immigration_status: 'Resident',
    address: '820 NW 12th Ave',
    city: 'Miami',
    state: 'FL',
    zip_code: '33136',
    county: 'Miami-Dade',
    agent_info: {
      full_name: 'Sebastian Gomez',
      first_name: 'Sebastian',
      last_name: 'Gomez',
      email: 'agent.sebastian@sunstate.com',
      phone: '(305) 555-0100',
      agency_name: 'Sunstate Insurance Group',
      npn: '19827461',
      license_number: 'FL-W382910',
      license_state: 'FL',
      business_address: '100 Biscayne Blvd Ste 1200',
      city: 'Miami',
      state: 'FL',
      zip_code: '33132',
      website: 'https://sunstateinsurance.com',
    },
  };

  const mockHealthPolicy: PolicyMergeData = {
    policy_id: 'policy-789',
    client_id: 'client-123',
    category: 'health',
    policy_type: null,
    policy_subtype: null,
    expiration_date: null,
    full_premium: null,
    carrier: 'Florida Blue',
    company_name: 'Florida Blue',
    plan_name: 'Florida Blue Silver 1410',
    plan_id: '21984FL0010001',
    policy_number: 'POL-2026-99',
    effective_date: '2026-01-01',
    monthly_premium: 350.00,
    household_income: 45000, // Strictly maps to client.total_income
    tax_credit: 250.00,
    tax_household_size: 3,
    coverage_members_count: 2,
    enrolled: true,
  };

  const mergeValuesWithHealth = buildMergeData(mockClientData, mockHealthPolicy);
  const mergeValuesNoPolicy = buildMergeData(mockClientData, null);

  // Assertion A & B: Verify Resolved Data Fields in Merge Values
  assert(
    mergeValuesWithHealth['client.email'] === 'maria.personal@example.com',
    'Assertion A1: client.email resolves to client_personal_information email'
  );
  assert(
    mergeValuesWithHealth['client.phone'] === '(305) 555-0148',
    'Assertion A2: client.phone resolves to client_personal_information phone'
  );
  assert(
    mergeValuesWithHealth['agent.full_name'] === 'Sebastian Gomez',
    'Assertion B1: agent.full_name resolves from profiles.name'
  );
  assert(
    mergeValuesWithHealth['agent.email'] === 'agent.sebastian@sunstate.com',
    'Assertion B2: agent.email resolves from profiles.email'
  );
  assert(
    mergeValuesWithHealth['agent.phone'] === '(305) 555-0100',
    'Assertion B3: agent.phone resolves from profiles.phone'
  );
  assert(
    mergeValuesWithHealth['agent.npn'] === '19827461',
    'Assertion B4: agent.npn resolves from profiles.npn_number'
  );

  // Assertion D: Total Income Rule Validation
  assert(
    mergeValuesWithHealth['client.total_income'] === '$45,000.00',
    'Assertion D1: client.total_income strictly maps to health_policies.household_income formatted as currency'
  );
  assert(
    mergeValuesNoPolicy['client.total_income'] === undefined,
    'Assertion D2: client.total_income is undefined when no health policy is attached'
  );

  // ---------------------------------------------------------------------------
  // 2. Delimiter Normalization & Backward Compatibility
  // ---------------------------------------------------------------------------
  const rawMalformedHtml = `
    <p>Client Email: client.email</p>
    <p>Client Phone: client.phone</p>
    <p>Annual Income: client.total_income</p>
    <p>Agent NPN: agent.npn</p>
    <p>Agent Phone: agent.phone</p>
    <p>Section 3.1 is standard prose with periods.</p>
  `;

  const normalizedHtml = normalizeVariableDelimiters(rawMalformedHtml);

  assert(
    normalizedHtml.includes('{{client.email}}') &&
    normalizedHtml.includes('{{client.phone}}') &&
    normalizedHtml.includes('{{client.total_income}}') &&
    normalizedHtml.includes('{{agent.npn}}') &&
    normalizedHtml.includes('{{agent.phone}}'),
    'Assertion E1: Raw unbraced allowed tokens are automatically normalized to {{token}}'
  );

  assert(
    normalizedHtml.includes('Section 3.1 is standard prose with periods.'),
    'Assertion E2: Standard prose containing periods is left untouched'
  );

  // Assertion E3: extractVariables produces clean token array in stable sorted order
  const extracted = extractVariables({ html: rawMalformedHtml, blocks: [] });
  assert(
    JSON.stringify(extracted) === JSON.stringify(['agent.npn', 'agent.phone', 'client.email', 'client.phone', 'client.total_income']),
    'Assertion E3: extractVariables produces clean token array in stable sorted order',
    `Received: ${JSON.stringify(extracted)}`
  );

  // ---------------------------------------------------------------------------
  // 3. Substitution & Template Content Rendering
  // ---------------------------------------------------------------------------
  const renderedHtml = substitute(rawMalformedHtml, mergeValuesWithHealth);

  assert(
    renderedHtml.includes('Client Email: maria.personal@example.com') &&
    renderedHtml.includes('Client Phone: (305) 555-0148') &&
    renderedHtml.includes('Annual Income: $45,000.00') &&
    renderedHtml.includes('Agent NPN: 19827461') &&
    renderedHtml.includes('Agent Phone: (305) 555-0100'),
    'Assertion G1: Full template substitution successfully replaces all 5 variables with real values',
    `Rendered Output:\n${renderedHtml}`
  );

  // ---------------------------------------------------------------------------
  // 4. Unresolved Policy Variables Detection
  // ---------------------------------------------------------------------------
  const unresolvedWhenNoPolicy = findUnresolvedVariables(extracted, mergeValuesNoPolicy, false);
  const incomeUnresolved = unresolvedWhenNoPolicy.find(u => u.token === 'client.total_income');

  assert(
    incomeUnresolved !== undefined && incomeUnresolved.needsPolicy === true,
    'Assertion F1: client.total_income is correctly flagged as requiring a policy when no health policy is attached'
  );

  console.log('\n--------------------------------------------------');
  console.log(`TOTAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('--------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error running regression suite:', err);
  process.exit(1);
});
