const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split(/\r?\n/).forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function searchLauraMerloClient() {
  console.log("==================================================");
  console.log("1. SEARCHING PUBLIC.PROFILES (AGENT RECORD)");
  console.log("==================================================");
  const { data: agentProfiles, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .or('name.ilike.%Laura Merlo%,email.ilike.%laura%');
  
  console.log("Agent profiles matching 'Laura Merlo':");
  console.log(JSON.stringify(agentProfiles, null, 2));

  const lauraAgentId = agentProfiles && agentProfiles.length > 0 ? agentProfiles[0].id : null;
  const lauraAgentEmail = agentProfiles && agentProfiles.length > 0 ? agentProfiles[0].email : null;

  console.log("\n==================================================");
  console.log("2. SEARCHING PUBLIC.CLIENTS FOR CLIENT 'LAURA MERLO'");
  console.log("==================================================");
  const { data: clientMatches, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*, policies(*)')
    .or('full_name.ilike.%Laura Merlo%,email.ilike.%lauramerlo%');
  
  console.log(`Matching rows in public.clients (${clientMatches?.length || 0}):`);
  console.log(JSON.stringify(clientMatches, null, 2));

  console.log("\n==================================================");
  console.log("3. SEARCHING PUBLIC.CLIENT_PERSONAL_INFORMATION");
  console.log("==================================================");
  const { data: piMatches } = await supabaseAdmin
    .from('client_personal_information')
    .select('*')
    .or('full_name.ilike.%Laura Merlo%,first_name.ilike.%Laura%,last_name.ilike.%Merlo%,email.ilike.%lauramerlo%');
  
  console.log(`Matching rows in client_personal_information (${piMatches?.length || 0}):`);
  console.log(JSON.stringify(piMatches, null, 2));

  console.log("\n==================================================");
  console.log("4. SEARCHING RELATED TABLES IN ACTIVE DATABASE");
  console.log("==================================================");
  const relatedTables = [
    'policies',
    'health_policies',
    'life_policies',
    'client_residence_information',
    'client_income_information',
    'client_co_applicant_information',
    'client_notes',
    'client_documents',
    'signature_requests',
    'activity_events'
  ];

  for (const table of relatedTables) {
    try {
      const { data, error } = await supabaseAdmin.from(table).select('*');
      if (error || !data) continue;
      const strified = JSON.stringify(data);
      if (strified.toLowerCase().includes('laura merlo') || strified.toLowerCase().includes('lauramerlo')) {
        console.log(`Table '${table}' HAS matches for 'Laura Merlo'!`);
        const matchingRows = data.filter(row => JSON.stringify(row).toLowerCase().includes('laura merlo'));
        console.log(JSON.stringify(matchingRows, null, 2));
      } else {
        console.log(`Table '${table}': No direct text matches for 'Laura Merlo'.`);
      }
    } catch (e) {
      console.log(`Error checking table '${table}':`, e.message);
    }
  }

  console.log("\n==================================================");
  console.log("5. SEARCHING LOCAL BACKUP / AUDIT / JSON FILES");
  console.log("==================================================");
  
  function searchFilesInDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        if (f !== 'node_modules' && f !== '.next' && f !== '.git') {
          searchFilesInDir(full, fileList);
        }
      } else {
        if (f.endsWith('.json') || f.endsWith('.sql') || f.endsWith('.md') || f.endsWith('.js') || f.endsWith('.ts')) {
          fileList.push(full);
        }
      }
    }
    return fileList;
  }

  const allProjectFiles = searchFilesInDir('.');
  console.log(`Searching across ${allProjectFiles.length} project backup/sql/json/js files...`);

  const backupMatches = [];

  for (const filePath of allProjectFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.toLowerCase().includes('laura merlo')) {
        // Check if it's describing a client or an agent or just code/comments
        const lines = content.split('\n');
        const matchingLines = [];
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('laura merlo')) {
            matchingLines.push({ lineNum: idx + 1, content: line.trim() });
          }
        });
        backupMatches.push({ filePath, matchesCount: matchingLines.length, sampleLines: matchingLines.slice(0, 10) });
      }
    } catch (e) {}
  }

  console.log(`Found ${backupMatches.length} files mentioning 'Laura Merlo':`);
  backupMatches.forEach(bm => {
    console.log(`\nFile: ${bm.filePath} (${bm.matchesCount} lines)`);
    bm.sampleLines.forEach(l => console.log(`  L${l.lineNum}: ${l.content.slice(0, 150)}`));
  });

  console.log("\n==================================================");
  console.log("6. SPECIFIC JSON BACKUP FILE INSPECTION");
  console.log("==================================================");

  const targetJsonFiles = [
    'scratch/policies_dump.json',
    'scratch/inventory_audit.json',
    'scratch/audit_report.json',
    'scratch/sweep_raw.json'
  ];

  for (const jf of targetJsonFiles) {
    if (fs.existsSync(jf)) {
      console.log(`Checking ${jf}...`);
      try {
        const raw = fs.readFileSync(jf, 'utf8');
        if (raw.toLowerCase().includes('laura merlo')) {
          console.log(`  -> MATCH FOUND IN ${jf}! Searching for client objects...`);
          // Try parsing JSON or searching regex
          if (jf.endsWith('.json')) {
            const parsed = JSON.parse(raw);
            console.log(`  Type of ${jf}:`, Array.isArray(parsed) ? `Array (${parsed.length})` : typeof parsed);
            // Search inside array or object
            const foundObj = findLauraInJson(parsed);
            console.log(`  Extracted objects from ${jf}:`, JSON.stringify(foundObj, null, 2).slice(0, 1000));
          }
        } else {
          console.log(`  -> No match in ${jf}.`);
        }
      } catch (e) {
        console.log(`  Error reading ${jf}: ${e.message}`);
      }
    }
  }
}

function findLauraInJson(obj, hits = []) {
  if (!obj) return hits;
  if (typeof obj === 'string') {
    if (obj.toLowerCase().includes('laura merlo')) return true;
    return false;
  }
  if (Array.isArray(obj)) {
    obj.forEach(item => {
      if (JSON.stringify(item).toLowerCase().includes('laura merlo')) {
        hits.push(item);
      }
    });
  } else if (typeof obj === 'object') {
    if (JSON.stringify(obj).toLowerCase().includes('laura merlo')) {
      hits.push(obj);
    }
  }
  return hits;
}

searchLauraMerloClient().catch(console.error);
