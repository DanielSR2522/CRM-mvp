const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/app/clients/[id]/page.tsx'), 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('activeCount') || line.includes('expiringSoonCount') || line.includes('pendingCount') || line.includes('allPolicies')) {
    console.log(`L${idx + 1}: ${line}`);
  }
});
