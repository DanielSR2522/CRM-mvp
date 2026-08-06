const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/app/clients/[id]/page.tsx'), 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('fetchPolicies') || l.includes('fetchClientDetails')) {
    console.log(`L${idx + 1}: ${l}`);
  }
});
