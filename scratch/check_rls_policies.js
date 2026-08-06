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

async function checkRls() {
  console.log('=== CHECKING ALL PROFILES IN DB ===');

  const { data: profiles, error } = await client
    .from('profiles')
    .select('id, name, email, business_lines');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log('Found profiles count:', profiles.length);
  profiles.forEach(p => {
    console.log(`- Profile [${p.id}]: ${p.email} | business_lines:`, p.business_lines);
  });
}

checkRls().catch(console.error);
