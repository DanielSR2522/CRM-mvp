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

async function testBusinessLines() {
  const userId = '5a844343-d2ae-4864-b317-32b196a5c905';

  console.log('=== TEST 1: Update business_lines to ["health"] ===');
  const { error: updateErr } = await client
    .from('profiles')
    .update({ business_lines: ['health'] })
    .eq('id', userId);

  if (updateErr) {
    console.error('Update error:', updateErr);
    return;
  }

  console.log('Update successful. Now fetching profile back...');

  const { data, error: fetchErr } = await client
    .from('profiles')
    .select('business_lines')
    .eq('id', userId)
    .single();

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return;
  }

  console.log('Fetched data from DB:', data);

  // Now let's test what fetchAgentBusinessLines from businessLines.ts does!
  const DEFAULT_BUSINESS_LINES = ['health', 'life', 'property_casualty', 'supplemental'];

  function parseFetchedLines(dbLines) {
    if (!Array.isArray(dbLines) || dbLines.length === 0) {
      return DEFAULT_BUSINESS_LINES;
    }
    const validLines = dbLines.filter(b => DEFAULT_BUSINESS_LINES.includes(b));
    return validLines.length > 0 ? validLines : DEFAULT_BUSINESS_LINES;
  }

  console.log('Parsed lines:', parseFetchedLines(data.business_lines));
}

testBusinessLines().catch(console.error);
