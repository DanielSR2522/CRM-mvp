const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function runOwnershipAudit() {
  console.log('--- 1 & 2. Auditing DB distinct values & counts for policies.policy_ownership_type ---');
  
  const { data: allPolicies, error } = await supabase
    .from('policies')
    .select('id, policy_ownership_type');

  if (error) {
    console.error('Error querying policies:', error);
    return;
  }

  const counts = {};
  (allPolicies || []).forEach(p => {
    const val = p.policy_ownership_type === null ? 'NULL' : p.policy_ownership_type;
    counts[val] = (counts[val] || 0) + 1;
  });

  console.log('Total policies in DB:', allPolicies.length);
  console.log('Policy Ownership Type breakdown:', counts);

  // Check SQL migrations for check constraint definitions
  console.log('\n--- Checking SQL migrations for chk_policy_ownership_type constraint ---');
  const migrationsDir = 'supabase/migrations';
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir);
    files.forEach(file => {
      const content = fs.readFileSync(`${migrationsDir}/${file}`, 'utf8');
      if (content.includes('policy_ownership_type') || content.includes('chk_policy_ownership_type')) {
        console.log(`Match in ${file}:`);
        content.split('\n').forEach(line => {
          if (line.includes('policy_ownership_type') || line.includes('chk_policy_ownership_type') || line.includes('CHECK')) {
            console.log('  ', line.trim());
          }
        });
      }
    });
  }
}

runOwnershipAudit();
