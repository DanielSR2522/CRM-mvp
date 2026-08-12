const fs = require('fs');

const path = 'src/app/clients/[id]/policies/[policyId]/page.tsx';
const content = fs.readFileSync(path, 'utf8');

console.log('=== Searching src/app/clients/[id]/policies/[policyId]/page.tsx for Documents tab ===');

const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.toLowerCase().includes('document') || line.toLowerCase().includes('folder') || line.toLowerCase().includes('upload') || line.toLowerCase().includes('activeTab')) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
});
