const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');

console.log('=== RESIDENCE FORM IN OLD PAGE.TSX ===');
const resStart = oldContent.indexOf("Residence Information");
const incStart = oldContent.indexOf("Income Information");
console.log(oldContent.substring(resStart, incStart));

console.log('=== INCOME MODAL IN OLD PAGE.TSX ===');
const incModalStart = oldContent.indexOf("Add Income");
console.log(oldContent.substring(incModalStart, incModalStart + 2000));
