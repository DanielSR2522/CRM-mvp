const fs = require('fs');

const text = fs.readFileSync('supabase/migrations/20260810000000_scoped_pc_shared_access.sql', 'utf8');

const createMatches = [...text.matchAll(/CREATE\s+POLICY\s+"([^"]+)"[\s\n]+ON[\s\n]+public\.([a-zA-Z0-9_]+)/g)];
const dropMatches = [...text.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"[\s\n]+ON[\s\n]+public\.([a-zA-Z0-9_]+)/g)];

const createPolicies = createMatches.map(m => ({ name: m[1], table: m[2] }));
const dropPolicies = dropMatches.map(m => ({ name: m[1], table: m[2] }));

console.log(`Total CREATE POLICY statements found: ${createPolicies.length}`);
console.log(`Total DROP POLICY IF EXISTS statements found: ${dropPolicies.length}\n`);

let allMatched = true;

createPolicies.forEach(cp => {
  const hasMatchingDrop = dropPolicies.some(dp => dp.name === cp.name && dp.table === cp.table);
  if (hasMatchingDrop) {
    console.log(`✅ MATCHED: Table '${cp.table}' -> Policy "${cp.name}"`);
  } else {
    allMatched = false;
    console.error(`❌ MISSING DROP: Table '${cp.table}' -> Policy "${cp.name}"`);
  }
});

if (allMatched && createPolicies.length > 0) {
  console.log(`\nSUCCESS: 100% of ${createPolicies.length} CREATE POLICY statements have matching DROP POLICY IF EXISTS!`);
} else {
  console.error('\nFAILURE: Some CREATE POLICY statements are missing matching DROP POLICY IF EXISTS!');
}
