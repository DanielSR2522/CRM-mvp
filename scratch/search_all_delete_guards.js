const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../migration_electronic_signatures.sql'), 'utf8');
const lines = content.split('\n');

console.log('--- Searching all DELETE triggers / guards in migration_electronic_signatures.sql ---');
lines.forEach((line, idx) => {
  if (line.includes('BEFORE DELETE') || line.includes('guard_delete') || line.includes('cannot be deleted')) {
    console.log(`L${idx + 1}: ${line}`);
  }
});
