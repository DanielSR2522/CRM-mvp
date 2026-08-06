const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');

// Find Residence Information and Income Information JSX blocks
const residenceIdx = oldContent.indexOf("Residence Information");
const incomeIdx = oldContent.indexOf("Income Information");
const dangerIdx = oldContent.indexOf("Danger Zone");

console.log('=== RESIDENCE & INCOME JSX BLOCK ===');
console.log(oldContent.substring(residenceIdx - 100, dangerIdx - 50));
