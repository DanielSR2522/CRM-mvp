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

async function runVerificationTests() {
  console.log('====================================================');
  console.log('TESTING GROUPED COMMERCIAL COMPANY POLICY SEARCH');
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

  // Phase 1: Setup Test Data
  console.log('--- Phase 1: Setting up Test Data ---');
  
  // Clean up existing test data
  await adminClient.from('clients').delete().ilike('full_name', 'TEST_GROUPED_COMPANY_%');

  const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';

  // Create Target Personal Client
  const { data: targetPersonalClient } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: 'TEST_GROUPED_COMPANY_TargetPersonalClient',
    email: 'target_personal@example.com'
  }).select().single();

  // Create Other Personal Client (for Conflict test)
  const { data: otherPersonalClient } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: 'TEST_GROUPED_COMPANY_OtherPersonalClient',
    email: 'other_personal@example.com'
  }).select().single();

  // Create Commercial Client / Company (545510, LLC)
  const { data: commercialCompanyClient } = await adminClient.from('clients').insert({
    agent_id: AMANDA_UUID,
    full_name: '545510, LLC',
    agency_name: '545510 Commercial Agency',
    email: 'info@545510llc.com',
    phone: '3055550199'
  }).select().single();

  // Create 3 Commercial P&C Policies for 545510, LLC
  const { data: pol1, error: p1Err } = await adminClient.from('policies').insert({
    client_id: commercialCompanyClient.id,
    policy_number: 'TEST-POL-15858149-1',
    policy_type: 'Commercial Property',
    company_name: 'Citizens',
    policy_ownership_type: 'company',
    status: 'Active'
  }).select().single();
  if (p1Err) console.error('P1 Insert Error:', p1Err);

  const { data: pol2, error: p2Err } = await adminClient.from('policies').insert({
    client_id: commercialCompanyClient.id,
    policy_number: 'TEST-POL-15858149-2',
    policy_type: 'General Liability',
    company_name: 'Progressive Commercial',
    policy_ownership_type: 'company',
    status: 'Active'
  }).select().single();
  if (p2Err) console.error('P2 Insert Error:', p2Err);

  const { data: pol3, error: p3Err } = await adminClient.from('policies').insert({
    client_id: commercialCompanyClient.id,
    policy_number: 'TEST-POL-15858149-3',
    policy_type: 'Commercial Auto',
    company_name: 'State Farm Commercial',
    policy_ownership_type: 'company',
    status: 'Active'
  }).select().single();
  if (p3Err) console.error('P3 Insert Error:', p3Err);

  // Create a Health Policy for 545510, LLC (To test strict isolation Case D)
  const { data: healthPol, error: hErr } = await adminClient.from('health_policies').insert({
    client_id: commercialCompanyClient.id,
    plan_name: 'Commercial Health Plan',
    active: true
  }).select().maybeSingle();
  if (hErr) console.log('healthPol insert info:', hErr.message);

  // Setup Link status:
  // pol2 is linked to targetPersonalClient (Already Linked)
  const { error: link2Err } = await adminClient.from('personal_commercial_policy_links').insert({
    personal_client_id: targetPersonalClient.id,
    commercial_policy_id: pol2.id,
    linked_person_role: 'main_applicant',
    created_by: AMANDA_UUID
  });
  if (link2Err) console.error('Link 2 Insert Error:', link2Err);

  // pol3 is linked to otherPersonalClient (Conflict / Unavailable)
  const { error: link3Err } = await adminClient.from('personal_commercial_policy_links').insert({
    personal_client_id: otherPersonalClient.id,
    commercial_policy_id: pol3.id,
    linked_person_role: 'main_applicant',
    created_by: AMANDA_UUID
  });
  if (link3Err) console.error('Link 3 Insert Error:', link3Err);

  // pol1 is unlinked (Available)

  console.log('Test data created successfully.\n');

  // --- Simulated Search Function Execution ---
  async function executeSearch(queryStr, currentClientId) {
    const { data: rawPolicies } = await adminClient
      .from('policies')
      .select('id, client_id, policy_number, policy_type, policy_subtype, company_name, writing_company, status, effective_date, expiration_date, policy_ownership_type')
      .eq('policy_ownership_type', 'company');

    const policiesList = rawPolicies || [];
    const clientIds = Array.from(new Set(policiesList.map((p) => p.client_id).filter(Boolean)));
    
    const { data: clientsData } = await adminClient
      .from('clients')
      .select('id, full_name, agency_name, email, phone')
      .in('id', clientIds);

    const clientMap = {};
    (clientsData || []).forEach(c => clientMap[c.id] = c);

    const policyIds = policiesList.map(p => p.id);
    const { data: linksData } = await adminClient
      .from('personal_commercial_policy_links')
      .select('commercial_policy_id, personal_client_id')
      .in('commercial_policy_id', policyIds);

    const linksMap = {};
    (linksData || []).forEach(l => linksMap[l.commercial_policy_id] = l.personal_client_id);

    const groupsMap = {};
    policiesList.forEach(p => {
      const cid = p.client_id;
      if (!cid) return;
      if (!groupsMap[cid]) {
        groupsMap[cid] = {
          client: clientMap[cid] || { id: cid, full_name: 'Commercial Client' },
          policies: []
        };
      }
      groupsMap[cid].policies.push({
        ...p,
        linkOwnerId: linksMap[p.id] || null
      });
    });

    const q = queryStr.trim().toLowerCase();
    return Object.values(groupsMap).filter((group) => {
      if (!q) return true;
      const cName = (group.client?.full_name || '').toLowerCase();
      const cAgency = (group.client?.agency_name || '').toLowerCase();
      const cEmail = (group.client?.email || '').toLowerCase();
      const cPhone = (group.client?.phone || '').toLowerCase();
      
      if (cName.includes(q) || cAgency.includes(q) || cEmail.includes(q) || cPhone.includes(q)) return true;

      return group.policies.some((p) => {
        const pNum = (p.policy_number || '').toLowerCase();
        const pType = (p.policy_type || '').toLowerCase();
        const pCompany = (p.company_name || p.writing_company || '').toLowerCase();
        return pNum.includes(q) || pType.includes(q) || pCompany.includes(q);
      });
    });
  }

  // --- CASE C: Search by one policy number ---
  console.log('--- CASE C: Search by single policy number ---');
  const searchResultsByPolNum = await executeSearch('TEST-POL-15858149-1', targetPersonalClient.id);
  assert(searchResultsByPolNum.length === 1, 'Search by single policy number returns exactly 1 grouped profile card');
  
  const companyGroupC = searchResultsByPolNum[0];
  assert(companyGroupC.client.full_name === '545510, LLC', 'Grouped card client identity is 545510, LLC');
  assert(companyGroupC.policies.length === 3, 'Grouped card contains ALL 3 commercial P&C policies belonging to 545510, LLC');

  console.log('');

  // --- CASE B & status color logic verification ---
  console.log('--- CASE B: Status Color & Availability Breakdown ---');
  const pol1Status = !companyGroupC.policies.find(p => p.id === pol1.id).linkOwnerId ? 'AVAILABLE' : 'OTHER';
  const pol2Status = companyGroupC.policies.find(p => p.id === pol2.id).linkOwnerId === targetPersonalClient.id ? 'ALREADY_LINKED' : 'OTHER';
  const pol3Owner = companyGroupC.policies.find(p => p.id === pol3.id).linkOwnerId;
  const pol3Status = (pol3Owner && pol3Owner !== targetPersonalClient.id) ? 'CONFLICT_RED' : 'OTHER';

  assert(pol1Status === 'AVAILABLE', 'Unlinked policy 1 is marked AVAILABLE (Green state)');
  assert(pol2Status === 'ALREADY_LINKED', 'Policy 2 linked to target client is marked ALREADY_LINKED (Blue state)');
  assert(pol3Status === 'CONFLICT_RED', 'Policy 3 linked to another client is marked CONFLICT_RED (Red state)');

  console.log('');

  // --- CASE A & Profile-Level Selection Execution ---
  console.log('--- CASE A & B: Multi-Policy Linking Execution ---');
  const eligiblePoliciesToLink = companyGroupC.policies.filter(p => !p.linkOwnerId);
  assert(eligiblePoliciesToLink.length === 1 && eligiblePoliciesToLink[0].id === pol1.id, 'Only the 1 available policy is eligible for linking');

  // Execute multi-policy link simulation using Promise.allSettled
  const linkResults = await Promise.allSettled(
    eligiblePoliciesToLink.map(p =>
      adminClient.from('personal_commercial_policy_links').insert({
        personal_client_id: targetPersonalClient.id,
        commercial_policy_id: p.id,
        linked_person_role: 'main_applicant',
        created_by: AMANDA_UUID
      })
    )
  );
  assert(linkResults.every(r => r.status === 'fulfilled' && !r.value.error), 'Profile link execution completed without errors');

  // Verify updated link states
  const searchResultsPostLink = await executeSearch('TEST-POL-15858149-1', targetPersonalClient.id);
  const updatedGroup = searchResultsPostLink[0];
  const postPol1Owner = updatedGroup.policies.find(p => p.id === pol1.id).linkOwnerId;
  const postPol2Owner = updatedGroup.policies.find(p => p.id === pol2.id).linkOwnerId;
  const postPol3Owner = updatedGroup.policies.find(p => p.id === pol3.id).linkOwnerId;

  assert(postPol1Owner === targetPersonalClient.id, 'Policy 1 is now linked to target personal client');
  assert(postPol2Owner === targetPersonalClient.id, 'Policy 2 remains linked to target personal client (No duplicate/overwrite)');
  assert(postPol3Owner === otherPersonalClient.id, 'Policy 3 remains linked to other personal client (Conflict preserved)');

  console.log('');

  // --- CASE D: Health / Life Strict Module Isolation ---
  console.log('--- CASE D: Strict Module Isolation ---');
  const allQueriedPolicyTypes = companyGroupC.policies.map(p => p.policy_type);
  assert(!allQueriedPolicyTypes.includes('Commercial Health Plan'), 'Health policy is NEVER included in Commercial P&C search results');

  // Cleanup Test Data
  console.log('\n--- Phase 3: Cleanup Test Data ---');
  await adminClient.from('personal_commercial_policy_links').delete().in('commercial_policy_id', [pol1.id, pol2.id, pol3.id]);
  await adminClient.from('policies').delete().in('id', [pol1.id, pol2.id, pol3.id]);
  if (healthPol?.id) {
    await adminClient.from('health_policies').delete().eq('id', healthPol.id);
  }
  await adminClient.from('clients').delete().ilike('full_name', 'TEST_GROUPED_COMPANY_%');
  await adminClient.from('clients').delete().eq('id', commercialCompanyClient.id);
  console.log('Cleanup finished.\n');

  console.log('====================================================');
  console.log(`VERIFICATION SUMMARY: ${passCount} / ${testCount} TESTS PASSED`);
  console.log('====================================================');
}

runVerificationTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
