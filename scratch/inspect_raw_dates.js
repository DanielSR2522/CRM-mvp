const fs = require('fs');
const path = require('path');

const sweep = JSON.parse(fs.readFileSync(path.join(__dirname, 'sweep_raw.json'), 'utf-8'));

console.log('=== toLocaleDateString Occurrences ===');
sweep.toLocaleDateString.forEach(item => console.log(`${item.file}:${item.line} -> ${item.text}`));

console.log('\n=== toLocaleString Occurrences ===');
sweep.toLocaleString.forEach(item => console.log(`${item.file}:${item.line} -> ${item.text}`));

console.log('\n=== type="date" Occurrences ===');
sweep.typeDate.forEach(item => console.log(`${item.file}:${item.line} -> ${item.text}`));
