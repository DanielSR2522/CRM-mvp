const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/app/clients/[id]/policies/[policyId]/page.tsx'), 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('Client Information') || l.includes('client?.email') || l.includes('client?.phone') || l.includes('client?.address') || l.includes('client?.full_name')) {
    console.log(`L${idx + 1}: ${l.trim()}`);
  }
});
