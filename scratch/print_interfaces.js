const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');
const lines = oldContent.split('\n');

console.log('=== CLIENT RESIDENCE & INCOME INTERFACES ===');
console.log(lines.slice(100, 135).join('\n'));
