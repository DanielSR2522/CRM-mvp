const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function auditSchema() {
  console.log('--- 1. Inspecting clients table columns ---');
  const { data: clientsSample } = await supabase.from('clients').select('*').limit(1);
  if (clientsSample && clientsSample.length > 0) {
    console.log('clients columns:', Object.keys(clientsSample[0]));
  } else {
    console.log('No rows in clients, trying metadata query...');
  }

  console.log('--- 2. Inspecting client_personal_information table columns ---');
  const { data: personalSample } = await supabase.from('client_personal_information').select('*').limit(1);
  if (personalSample && personalSample.length > 0) {
    console.log('client_personal_information columns:', Object.keys(personalSample[0]));
  }

  console.log('--- 3. Inspecting personal_commercial_policy_links table columns ---');
  const { data: linksSample } = await supabase.from('personal_commercial_policy_links').select('*').limit(1);
  if (linksSample && linksSample.length > 0) {
    console.log('personal_commercial_policy_links columns:', Object.keys(linksSample[0]));
  }

  console.log('--- 4. Inspecting policies table columns ---');
  const { data: polSample } = await supabase.from('policies').select('*').limit(1);
  if (polSample && polSample.length > 0) {
    console.log('policies columns:', Object.keys(polSample[0]));
  }
}

auditSchema();
