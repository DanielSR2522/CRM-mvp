const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('client_personal_information') || line.includes('clients') || line.includes('email') || line.includes('phone')) {
    if (index < 100 || line.includes('from(') || line.includes('select(') || line.includes('update(') || line.includes('personal')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  }
});
