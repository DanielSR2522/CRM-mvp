const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- Search activeTab occurrences in page.tsx ---');
lines.forEach((line, index) => {
  if (line.includes('activeTab') || line.includes('tab') || line.includes('BusinessLines')) {
    if (line.includes('Tab') || line.includes('activeTab') || line.includes('life')) {
      console.log(`L${index + 1}: ${line.trim()}`);
    }
  }
});
