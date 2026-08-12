const fs = require('fs');

const path = 'src/app/clients/[id]/page.tsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

console.log('=== Lines in src/app/clients/[id]/page.tsx with client-documents ===');
lines.forEach((line, i) => {
  if (line.includes('client-documents')) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
});
