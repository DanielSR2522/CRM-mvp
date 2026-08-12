const fs = require('fs');

const path = 'src/app/clients/[id]/page.tsx';
const content = fs.readFileSync(path, 'utf8');

console.log('=== Searching src/app/clients/[id]/page.tsx for Client Documents ===');

const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.toLowerCase().includes('document') || line.toLowerCase().includes('15mb') || line.toLowerCase().includes('20mb') || line.toLowerCase().includes('display name') || line.toLowerCase().includes('document type')) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
});
