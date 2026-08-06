const fs = require('fs');
const path = require('path');

function searchDocs(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith('.md') || f.endsWith('.sql')) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      if (content.includes('SQL Editor') || content.includes('migration') || content.includes('pooler')) {
        console.log('--- File:', f, '---');
        const lines = content.split('\n').slice(0, 30);
        console.log(lines.join('\n'));
      }
    }
  }
}

searchDocs(path.join(__dirname, '..'));
