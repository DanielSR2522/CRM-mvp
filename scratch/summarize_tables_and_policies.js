const fs = require('fs');
const path = require('path');

const policies = JSON.parse(fs.readFileSync(path.join(__dirname, 'policies_dump.json'), 'utf8'));

const byTable = {};

for (const p of policies) {
  const table = p.table.replace(/public\./g, '');
  if (!byTable[table]) byTable[table] = [];
  byTable[table].push(p);
}

console.log('=== TABLES WITH RLS POLICIES ===\n');
for (const [table, pols] of Object.entries(byTable)) {
  console.log(`Table: ${table} (${pols.length} policies)`);
  for (const pol of pols) {
    console.log(`  - [${pol.file}] ${pol.policy}`);
  }
}
