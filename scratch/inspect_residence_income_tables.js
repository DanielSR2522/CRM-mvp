const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');
const lines = oldContent.split('\n');

console.log('=== SEARCHING FOR RESIDENCE / INCOME IN OLD PAGE.TSX ===');
lines.forEach((line, idx) => {
  if (
    line.includes('Residence') ||
    line.includes('Income') ||
    line.includes('address') ||
    line.includes('city') ||
    line.includes('income') ||
    line.includes('tax_return')
  ) {
    if (line.includes('from(') || line.includes('interface') || line.includes('const [') || line.includes('<h3>')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  }
});
