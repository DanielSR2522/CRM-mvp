const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/components/health');
fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (l.includes('Active') && (l.includes('span') || l.includes('div') || l.includes('label') || l.includes('th') || l.includes('td'))) {
        console.log(`${file}:L${idx + 1}: ${l.trim()}`);
      }
    });
  }
});
