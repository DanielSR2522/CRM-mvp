const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkConstraint() {
  const { data: pols, error } = await supabase.from('policies').select('policy_ownership_type').limit(100);
  if (error) console.error(error);
  const types = Array.from(new Set((pols || []).map(p => p.policy_ownership_type)));
  console.log('Existing policy_ownership_type values in DB:', types);
}

checkConstraint();
