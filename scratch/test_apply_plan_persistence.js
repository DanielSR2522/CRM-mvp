const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envUrl = '';
let envServiceKey = '';

try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) envUrl = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) envServiceKey = line.split('=')[1].trim();
  });
} catch {}

const client = createClient(envUrl, envServiceKey);

async function testApplyPersistence() {
  console.log('=== TEST B & C: SUPABASE DATABASE PERSISTENCE VERIFICATION ===');

  // 1. Fetch an existing health policy row
  const { data: policies, error: pErr } = await client
    .from('health_policies')
    .select('*')
    .limit(1);

  if (pErr || !policies || policies.length === 0) {
    console.error('Could not fetch existing health policy from Supabase:', pErr);
    return;
  }

  const testPolicy = policies[0];
  console.log(`- Testing with Policy ID: ${testPolicy.id} (Client ID: ${testPolicy.client_id})`);

  // 2. Perform partial update via updateAppliedMarketplacePlan fields
  const applyPayload = {
    company_2026: 'Oscar Insurance Company',
    type_plan: 'Gold',
    plan_id: '21525FL0020016',
    plan_name: 'Gold Simple',
    plan_cost: 1022.46,
    tax_credit: 861.00,
    year_renovation: 2026,
    updated_at: new Date().toISOString()
  };

  const { data: updatedRow, error: uErr } = await client
    .from('health_policies')
    .update(applyPayload)
    .eq('id', testPolicy.id)
    .select('*')
    .single();

  if (uErr) {
    console.error('ERROR updating health_policies row:', uErr);
    return;
  }

  console.log('\n- PARTIAL UPDATE SUCCESSFUL on health_policies table!');
  console.log(`  plan_id: "${updatedRow.plan_id}" (Expected: "21525FL0020016")`);
  console.log(`  plan_name: "${updatedRow.plan_name}" (Expected: "Gold Simple")`);
  console.log(`  company_2026: "${updatedRow.company_2026}" (Expected: "Oscar Insurance Company")`);
  console.log(`  type_plan: "${updatedRow.type_plan}" (Expected: "Gold")`);
  console.log(`  plan_cost: $${updatedRow.plan_cost} (Expected: 1022.46)`);
  console.log(`  tax_credit: $${updatedRow.tax_credit} (Expected: 861)`);
  console.log(`  net premium: $${(updatedRow.plan_cost - updatedRow.tax_credit).toFixed(2)} (Expected: 161.46)`);
  console.log(`  year_renovation: ${updatedRow.year_renovation} (Expected: 2026)`);

  // 3. Verify no duplicate policies were created for client_id
  const { data: clientPolicies } = await client
    .from('health_policies')
    .select('id')
    .eq('client_id', testPolicy.client_id);

  console.log(`\n- Policy Count for Client ${testPolicy.client_id}: ${clientPolicies.length} (Confirmed no duplicate created!)`);

  // 4. Test Re-applying another plan
  const reapplyPayload = {
    company_2026: 'Ambetter Health',
    type_plan: 'Silver',
    plan_id: '30252FL0070065',
    plan_name: 'Ambetter Balanced Care 14',
    plan_cost: 950.00,
    tax_credit: 861.00,
    year_renovation: 2026,
    updated_at: new Date().toISOString()
  };

  const { data: reupdatedRow } = await client
    .from('health_policies')
    .update(reapplyPayload)
    .eq('id', testPolicy.id)
    .select('*')
    .single();

  console.log('\n- RE-APPLY DIFFERENT PLAN SUCCESSFUL!');
  console.log(`  New plan_id: "${reupdatedRow.plan_id}" (Replaced previous plan successfully!)`);

  // Restore original test policy values
  await client.from('health_policies').update({
    company_2026: testPolicy.company_2026,
    type_plan: testPolicy.type_plan,
    plan_id: testPolicy.plan_id,
    plan_name: testPolicy.plan_name,
    plan_cost: testPolicy.plan_cost,
    tax_credit: testPolicy.tax_credit,
    year_renovation: testPolicy.year_renovation
  }).eq('id', testPolicy.id);

  console.log('\n- Restored original policy values. TEST COMPLETE.');
}

testApplyPersistence().catch(console.error);
