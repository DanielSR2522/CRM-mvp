const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');

// Search for activeTab === 'personal-info' in JSX body
const tabStart = oldContent.indexOf("{activeTab === 'personal-info' && (");
const tabEnd = oldContent.indexOf("{activeTab === 'documents' && (");

const tabJSX = oldContent.substring(tabStart, tabEnd);

console.log('--- ALL CARDS / HEADINGS RENDERED IN PERSONAL INFO TAB ---');
const h3Matches = tabJSX.match(/<h3[^>]*>(.*?)<\/h3>/gs) || [];
h3Matches.forEach(h => console.log('H3 Header:', h.replace(/<[^>]+>/g, '').trim()));

const h4Matches = tabJSX.match(/<h4[^>]*>(.*?)<\/h4>/gs) || [];
h4Matches.forEach(h => console.log('H4 Header:', h.replace(/<[^>]+>/g, '').trim()));
