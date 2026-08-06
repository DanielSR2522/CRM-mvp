const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');
const lines = oldContent.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('personal-info')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
