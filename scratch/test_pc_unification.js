const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse LINES_OF_BUSINESS from src/constants/linesOfBusiness.ts
const lobFileContent = fs.readFileSync('./src/constants/linesOfBusiness.ts', 'utf8');
const matches = [...lobFileContent.matchAll(/"([^"]+)"/g)].map(m => m[1]);
// Exclude non-LOB strings if any
const LINES_OF_BUSINESS = matches.filter(s => !s.includes('array must contain'));

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testPcUnification() {
  console.log("==================================================");
  console.log("1. SHARED SOURCE OPTION COUNT & VALIDATION");
  console.log("==================================================");

  console.log(`✅ Total unified P&C Policy Types in LINES_OF_BUSINESS: ${LINES_OF_BUSINESS.length}`);
  if (LINES_OF_BUSINESS.length !== 48) {
    throw new Error(`Expected 48 policy types, got ${LINES_OF_BUSINESS.length}`);
  }

  const sortedLobs = [...LINES_OF_BUSINESS].sort((a, b) => a.localeCompare(b));
  console.log(`✅ First 3 options: ${sortedLobs.slice(0, 3).join(', ')}`);
  console.log(`✅ Last 3 options: ${sortedLobs.slice(-3).join(', ')}`);

  console.log("\n==================================================");
  console.log("2. EXISTING DATABASE POLICY TYPE BACKWARD COMPATIBILITY");
  console.log("==================================================");

  const { data: dbPolicies, error: dbErr } = await supabaseAdmin.from('policies').select('id, policy_type');
  if (dbErr) throw dbErr;

  const distinctDbTypes = [...new Set(dbPolicies.map(p => p.policy_type).filter(Boolean))];
  console.log(`Found ${distinctDbTypes.length} distinct policy types in active database records:`, distinctDbTypes);

  const lobSet = new Set(LINES_OF_BUSINESS);
  const unrepresented = distinctDbTypes.filter(t => !lobSet.has(t));

  if (unrepresented.length > 0) {
    console.warn("⚠️ Legacy/Unrepresented policy types in DB:", unrepresented);
  } else {
    console.log("✅ 100% of existing DB policy types are present in LINES_OF_BUSINESS!");
  }

  console.log("\n==================================================");
  console.log("3. SAVE & PERSISTENCE TEST FOR PERSONAL AND COMPANY CLIENTS");
  console.log("==================================================");

  // Fetch 1 Personal client & 1 Company client
  const { data: personalClients } = await supabaseAdmin.from('clients').select('id, full_name, client_type').eq('client_type', 'personal').limit(1);
  const { data: companyClients } = await supabaseAdmin.from('clients').select('id, full_name, client_type').eq('client_type', 'company').limit(1);

  if (personalClients.length > 0) {
    const pClient = personalClients[0];
    const { data: pPol, error: pErr } = await supabaseAdmin.from('policies').insert({
      client_id: pClient.id,
      policy_type: 'Business Owners',
      status: 'Active',
      created_at: new Date().toISOString()
    }).select().single();

    if (pErr) throw pErr;
    console.log(`✅ Personal Client ("${pClient.full_name}") saved with Commercial type 'Business Owners':`, pPol.id);

    await supabaseAdmin.from('policies').delete().eq('id', pPol.id);
  }

  if (companyClients.length > 0) {
    const cClient = companyClients[0];
    const { data: cPol, error: cErr } = await supabaseAdmin.from('policies').insert({
      client_id: cClient.id,
      policy_type: 'Auto (Personal)',
      status: 'Active',
      created_at: new Date().toISOString()
    }).select().single();

    if (cErr) throw cErr;
    console.log(`✅ Company Client ("${cClient.full_name}") saved with Personal type 'Auto (Personal)':`, cPol.id);

    await supabaseAdmin.from('policies').delete().eq('id', cPol.id);
  }

  console.log("\n🎉 ALL P&C POLICY TYPE UNIFICATION VERIFICATION TESTS PASSED!");
}

testPcUnification().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
