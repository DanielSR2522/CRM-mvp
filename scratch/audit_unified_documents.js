const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function auditDocumentTables() {
  console.log('====================================================');
  console.log('EMPIRICAL AUDIT OF ALL CRM DOCUMENT TABLES & SCHEMAS');
  console.log('====================================================\n');

  // 1. P&C policy_documents
  const { data: pcSample, error: pcErr } = await supabase.from('policy_documents').select('*').limit(1);
  console.log('1. public.policy_documents:', pcErr ? `❌ ${pcErr.message}` : (pcSample.length > 0 ? Object.keys(pcSample[0]) : 'EMPTY TABLE (EXISTS)'));

  // 2. Health health_policy_documents
  const { data: healthSample, error: hErr } = await supabase.from('health_policy_documents').select('*').limit(1);
  console.log('2. public.health_policy_documents:', hErr ? `❌ ${hErr.message}` : (healthSample.length > 0 ? Object.keys(healthSample[0]) : 'EMPTY TABLE (EXISTS)'));

  // 3. Life life_policy_documents vs life_documents
  const { data: lifePolSample, error: lpErr } = await supabase.from('life_policy_documents').select('*').limit(1);
  console.log('3. public.life_policy_documents:', lpErr ? `❌ ${lpErr.message}` : (lifePolSample.length > 0 ? Object.keys(lifePolSample[0]) : 'EMPTY TABLE (EXISTS)'));

  const { data: lifeSample, error: lErr } = await supabase.from('life_documents').select('*').limit(1);
  console.log('3b. public.life_documents:', lErr ? `❌ ${lErr.message}` : (lifeSample.length > 0 ? Object.keys(lifeSample[0]) : 'EMPTY TABLE (EXISTS)'));

  // 4. Client client_documents
  const { data: clientSample, error: cErr } = await supabase.from('client_documents').select('*').limit(1);
  console.log('4. public.client_documents:', cErr ? `❌ ${cErr.message}` : (clientSample.length > 0 ? Object.keys(clientSample[0]) : 'EMPTY TABLE (EXISTS)'));
}

auditDocumentTables();
