const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Date Utils Logic from src/utils/dateUtils.ts
const usDateToIso = (usStr) => {
  if (!usStr) return null;
  const clean = usStr.trim();
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1000 || y > 9999) return null;
  const testDate = new Date(y, m - 1, d);
  if (testDate.getFullYear() !== y || testDate.getMonth() !== m - 1 || testDate.getDate() !== d) {
    return null;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const formatIsoToUsDate = (isoStr) => {
  if (!isoStr) return 'Not provided';
  const clean = isoStr.trim().split('T')[0].split(' ')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4 && month.length <= 2 && day.length <= 2) {
      return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
    }
  }
  return isoStr;
};

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testMedicareUsaDates() {
  console.log("==================================================");
  console.log("1. TESTING DATE UTILITY CONVERSIONS (NO TIMEZONE SHIFT)");
  console.log("==================================================");

  // Test 1: 08/12/2026
  const usDate1 = '08/12/2026';
  const isoDate1 = usDateToIso(usDate1);
  console.log(`US Input: '${usDate1}' -> ISO DB persistence: '${isoDate1}'`);
  if (isoDate1 !== '2026-08-12') throw new Error(`Expected '2026-08-12', got '${isoDate1}'`);

  const uiFormatted1 = formatIsoToUsDate(isoDate1);
  console.log(`ISO DB: '${isoDate1}' -> UI Display: '${uiFormatted1}'`);
  if (uiFormatted1 !== '08/12/2026') throw new Error(`Expected '08/12/2026', got '${uiFormatted1}'`);

  // Test 2: 01/05/2027 (January 5, 2027)
  const usDate2 = '01/05/2027';
  const isoDate2 = usDateToIso(usDate2);
  console.log(`US Input: '${usDate2}' -> ISO DB persistence: '${isoDate2}'`);
  if (isoDate2 !== '2027-01-05') throw new Error(`Expected '2027-01-05' (January 5), got '${isoDate2}'`);

  const uiFormatted2 = formatIsoToUsDate(isoDate2);
  console.log(`ISO DB: '${isoDate2}' -> UI Display: '${uiFormatted2}'`);
  if (uiFormatted2 !== '01/05/2027') throw new Error(`Expected '01/05/2027', got '${uiFormatted2}'`);

  console.log("\n==================================================");
  console.log("2. TESTING DATABASE PERSISTENCE WITH SUPABASE");
  console.log("==================================================");

  const { data: clients } = await supabaseAdmin.from('clients').select('id, full_name').limit(1);
  const testClient = clients[0];
  console.log(`Using client: "${testClient.full_name}" (${testClient.id})`);

  const testPayload = {
    client_id: testClient.id,
    soa_date: usDateToIso('08/12/2026'),
    part_a_effective_date: usDateToIso('01/05/2027'),
    part_b_effective_date: usDateToIso('03/15/2026'),
    plan_effective_date: usDateToIso('12/01/2026'),
    updated_at: new Date().toISOString()
  };

  const { data: saved, error: saveErr } = await supabaseAdmin
    .from('client_medicare_information')
    .upsert(testPayload, { onConflict: 'client_id' })
    .select()
    .single();

  if (saveErr) throw saveErr;

  console.log("✅ DB Saved Record (ISO):", {
    soa_date: saved.soa_date,
    part_a_effective_date: saved.part_a_effective_date,
    part_b_effective_date: saved.part_b_effective_date,
    plan_effective_date: saved.plan_effective_date
  });

  // Verify ISO format in DB
  if (saved.soa_date !== '2026-08-12') throw new Error(`soa_date DB error: expected 2026-08-12, got ${saved.soa_date}`);
  if (saved.part_a_effective_date !== '2027-01-05') throw new Error(`part_a DB error: expected 2027-01-05, got ${saved.part_a_effective_date}`);

  // Fetch back & convert to UI Display
  const { data: reFetched } = await supabaseAdmin
    .from('client_medicare_information')
    .select('*')
    .eq('client_id', testClient.id)
    .single();

  const uiSoaDate = formatIsoToUsDate(reFetched.soa_date);
  const uiPartADate = formatIsoToUsDate(reFetched.part_a_effective_date);

  console.log("✅ Re-fetched & Formatted for UI (USA format):", {
    soa_date: uiSoaDate,
    part_a_effective_date: uiPartADate
  });

  if (uiSoaDate !== '08/12/2026') throw new Error(`UI display error: expected 08/12/2026, got ${uiSoaDate}`);
  if (uiPartADate !== '01/05/2027') throw new Error(`UI display error: expected 01/05/2027, got ${uiPartADate}`);

  console.log("\n🎉 ALL USA DATE FORMAT TESTS PASSED PERFECTLY!");
}

testMedicareUsaDates().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
