const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const content = fs.readFileSync(targetFile, 'utf-8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('activeTab ===')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
