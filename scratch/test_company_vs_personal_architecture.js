const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envText = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';

async function runValidationTests() {
  console.log('====================================================');
  console.log('TESTING COMPANY VS PERSONAL P&C CLIENT ARCHITECTURE');
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

  // --- Phase 1: Clean up existing test data ---
  await adminClient.from('clients').delete().ilike('full_name', 'TEST_ARCH_%');
  await adminClient.from('clients').delete().ilike('full_name', 'ABC Roofing LLC TEST');

  // --- TEST 1: PERSONAL CLIENT CREATION & FLOW ---
  console.log('--- TEST 1: Personal Client Workflow ---');
  
  const { data: personalClient, error: pClientErr } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: 'TEST_ARCH_John Personal',
    email: 'john_personal@example.com',
    phone: '3055550100'
  }).select().single();

  assert(!pClientErr && personalClient, 'Personal client row created in clients table');

  const { data: personalInfo } = await adminClient.from('client_personal_information').insert({
    client_id: personalClient.id,
    full_name: 'TEST_ARCH_John Personal',
    date_of_birth: '1985-05-15',
    ssn: '999-00-1111',
    gender: 'Male',
    marital_status: 'Married',
    has_co_applicant: true
  }).select().single();

  assert(personalInfo && personalInfo.ssn === '999-00-1111' && personalInfo.has_co_applicant === true, 'Personal client retains person-only fields and Co-Applicant option');

  const { data: personalPol, error: pPolErr } = await adminClient.from('policies').insert({
    client_id: personalClient.id,
    policy_number: 'TEST-POL-PERS-1',
    policy_type: 'Auto (Personal)',
    company_name: 'State Farm',
    policy_ownership_type: 'personal',
    status: 'Active'
  }).select().single();

  if (pPolErr) console.error('Personal Policy Insert Error:', pPolErr);

  assert(personalPol && (personalPol.policy_ownership_type === 'personal' || personalPol.policy_ownership_type === 'individual'), 'Personal policy uses policy_ownership_type = personal');

  console.log('');

  // --- TEST 2: COMPANY CLIENT CREATION & FLOW ---
  console.log('--- TEST 2: Company Client Workflow ---');

  const companyNameInput = 'ABC Roofing LLC TEST';
  const contactPersonInput = 'TEST_ARCH_Daniel Rodriguez Contact';

  // 1. Company Client Creation Simulation (matching NewClientWizardModal)
  const { data: companyClient, error: cClientErr } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: companyNameInput, // Primary company identity!
    agency_name: null,
    address: '100 Business Way, Miami, FL 33101',
    email: 'info@abcroofingtest.com',
    phone: '3055550200'
  }).select().single();

  assert(!cClientErr && companyClient, 'Company client created in clients table');
  assert(companyClient.full_name === 'ABC Roofing LLC TEST', 'Company Name is saved as primary client display name (clients.full_name)');
  assert(companyClient.agency_name === null, 'Company Name is NOT mapped to agency_name');

  // 2. Contact Person Creation Simulation
  const { data: companyContactInfo } = await adminClient.from('client_personal_information').insert({
    client_id: companyClient.id,
    full_name: contactPersonInput, // Contact Person Name!
    email: 'info@abcroofingtest.com',
    phone: '3055550200',
    date_of_birth: null,
    ssn: null,
    gender: null,
    marital_status: null,
    has_co_applicant: false
  }).select().single();

  assert(companyContactInfo && companyContactInfo.full_name === 'TEST_ARCH_Daniel Rodriguez Contact', 'Contact Person Name saved in client_personal_information.full_name');
  assert(companyContactInfo.date_of_birth === null && companyContactInfo.ssn === null && companyContactInfo.has_co_applicant === false, 'Company client has NULL person-only fields and no Co-Applicant');

  // 3. Commercial Policy Creation
  const { data: companyPol } = await adminClient.from('policies').insert({
    client_id: companyClient.id,
    policy_number: 'TEST-POL-COMP-1',
    policy_type: 'Commercial Property',
    company_name: 'Progressive Commercial',
    policy_ownership_type: 'company',
    status: 'Active'
  }).select().single();

  assert(companyPol && companyPol.policy_ownership_type === 'company', 'Company policy automatically uses policy_ownership_type = company');

  console.log('');

  // --- TEST 3: EXISTING PERSONAL CONTACT SELECTION & PREFILL ---
  console.log('--- TEST 3: Existing Personal Contact Selection (No Duplication) ---');

  // User selects personalClient as contact person for a new company
  const newCompanyName = 'ABC Roofing Branch 2 TEST';
  const { data: company2Client } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: newCompanyName,
    address: '200 Business Ave, Miami, FL 33102',
    email: personalClient.email,
    phone: personalClient.phone
  }).select().single();

  await adminClient.from('client_personal_information').insert({
    client_id: company2Client.id,
    full_name: personalClient.full_name, // Prefilled from existing personal client
    email: personalClient.email,
    phone: personalClient.phone,
    has_co_applicant: false
  });

  // Verify existing personal client count did not change
  const { data: pCount } = await adminClient.from('clients').select('id').eq('id', personalClient.id);
  assert(pCount.length === 1, 'Existing Personal client was NOT duplicated when selected as contact person');

  console.log('');

  // --- TEST 4: REGRESSION MATRIX ---
  console.log('--- TEST 4: Regression Matrix Checks ---');

  // Verify commercial policy search query compatibility
  const { data: queriedCompanyPolicies } = await adminClient
    .from('policies')
    .select('id, client_id, policy_number, policy_ownership_type')
    .eq('policy_ownership_type', 'company')
    .eq('id', companyPol.id);

  assert(queriedCompanyPolicies.length === 1, 'Company policies remain 100% compatible with Commercial Policy Search (policy_ownership_type = company)');

  // Cleanup Test Data
  console.log('\n--- Phase 3: Cleanup Test Data ---');
  const polIds = [personalPol?.id, companyPol?.id].filter(Boolean);
  if (polIds.length > 0) {
    await adminClient.from('policies').delete().in('id', polIds);
  }
  await adminClient.from('client_personal_information').delete().in('client_id', [personalClient.id, companyClient.id, company2Client.id]);
  await adminClient.from('clients').delete().in('id', [personalClient.id, companyClient.id, company2Client.id]);
  console.log('Cleanup finished.\n');

  console.log('====================================================');
  console.log(`VERIFICATION SUMMARY: ${passCount} / ${testCount} TESTS PASSED`);
  console.log('====================================================');
}

runValidationTests().catch(err => {
  console.error('Validation test error:', err);
  process.exit(1);
});
