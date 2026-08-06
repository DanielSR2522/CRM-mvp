const { supabase } = require('../src/lib/supabaseClient');

async function checkTables() {
  console.log('Checking health and life timeline tables...');

  const { data: healthData, error: hErr } = await supabase.from('health_policies').select('id, company_2026, plan_id, created_at, updated_at').limit(5);
  console.log('health_policies:', hErr ? hErr.message : healthData?.length);

  const { data: lifeData, error: lErr } = await supabase.from('life_policies').select('id, created_at, updated_at').limit(5);
  console.log('life_policies:', lErr ? lErr.message : lifeData?.length);

  const { data: lifeProdData, error: lpErr } = await supabase.from('life_policy_products').select('id, life_policy_id, product_type, company, policy_number, created_at').limit(5);
  console.log('life_policy_products:', lpErr ? lpErr.message : lifeProdData?.length);

  const { data: lifeBenData, error: lbErr } = await supabase.from('life_policy_beneficiaries').select('id, life_policy_id, name, benefit_percentage, created_at').limit(5);
  console.log('life_policy_beneficiaries:', lbErr ? lbErr.message : lifeBenData?.length);

  const { data: lifeDocData, error: ldErr } = await supabase.from('life_policy_documents').select('id, life_policy_id, file_name, created_at').limit(5);
  console.log('life_policy_documents:', ldErr ? ldErr.message : lifeDocData?.length);

  const { data: lifeNoteData, error: lnErr } = await supabase.from('life_policy_notes').select('id, life_policy_id, body, created_at').limit(5);
  console.log('life_policy_notes:', lnErr ? lnErr.message : lifeNoteData?.length);

  const { data: lifeTimeData, error: ltErr } = await supabase.from('life_policy_timeline_events').select('id, life_policy_id, title, description, created_at').limit(5);
  console.log('life_policy_timeline_events:', ltErr ? ltErr.message : lifeTimeData?.length);

  const { data: consentData, error: cErr } = await supabase.from('consent_signature_requests').select('id, template_title, status, created_at').limit(5);
  console.log('consent_signature_requests:', cErr ? cErr.message : consentData?.length);
}

checkTables();
