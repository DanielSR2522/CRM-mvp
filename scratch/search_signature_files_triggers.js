const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../migration_electronic_signatures.sql'), 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('signature_files') || line.includes('signed evidence') || line.includes('signed_document')) {
    console.log(`L${idx + 1}: ${line}`);
  }
});
