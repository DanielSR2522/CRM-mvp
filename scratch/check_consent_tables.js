const { supabase } = require('../src/lib/supabaseClient');

async function checkConsents() {
  const { data: d1, error: e1 } = await supabase.from('signature_requests').select('id, template_id, status, created_at').limit(5);
  console.log('signature_requests:', e1 ? e1.message : d1?.length);

  const { data: d2, error: e2 } = await supabase.from('consent_requests').select('id, created_at').limit(5);
  console.log('consent_requests:', e2 ? e2.message : d2?.length);

  const { data: d3, error: e3 } = await supabase.from('consents').select('id, created_at').limit(5);
  console.log('consents:', e3 ? e3.message : d3?.length);
}

checkConsents();
