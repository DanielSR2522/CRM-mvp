const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');

// Find all cards inside activeTab === 'personal-info'
const tabIdx = oldContent.indexOf("activeTab === 'personal-info'");
const documentsIdx = oldContent.indexOf("activeTab === 'documents'");

const personalInfoBlock = oldContent.substring(tabIdx, documentsIdx);

console.log('--- PERSONAL INFO BLOCK IN OLD PAGE.TSX ---');
console.log(personalInfoBlock.substring(0, 3000));
console.log('\n--- SECTION HEADINGS ---');
const headings = personalInfoBlock.match(/<h[2-5][^>]*>(.*?)<\/h[2-5]>/gs) || [];
console.log(headings.map(h => h.replace(/<[^>]+>/g, '').trim()));
