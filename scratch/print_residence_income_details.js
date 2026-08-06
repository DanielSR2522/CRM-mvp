const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');
const lines = oldContent.split('\n');

console.log('=== FETCH RESIDENCE INFO (around line 750) ===');
console.log(lines.slice(745, 810).join('\n'));

console.log('\n=== RENDER RESIDENCE & INCOME CARD JSX (around line 3100) ===');
console.log(lines.slice(3100, 3350).join('\n'));
