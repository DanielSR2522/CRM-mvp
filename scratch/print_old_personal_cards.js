const fs = require('fs');
const path = require('path');

const oldContent = fs.readFileSync(path.join(__dirname, 'old_page.tsx'), 'utf-8');
const lines = oldContent.split('\n');

const slice = lines.slice(2470, 3600).join('\n');

console.log('--- ALL H3 / H4 HEADERS IN PERSONAL INFO TAB IN OLD PAGE.TSX ---');
const headers = slice.match(/<h[2-4][^>]*>(.*?)<\/h[2-4]>/gs) || [];
headers.forEach(h => console.log(h.replace(/<[^>]+>/g, '').trim()));
