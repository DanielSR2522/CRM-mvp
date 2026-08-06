const fs = require('fs');
const path = require('path');

function searchFiles(dir, matchStr) {
  const results = [];
  function recursive(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const f of files) {
      const full = path.join(currentDir, f);
      if (fs.statSync(full).isDirectory()) {
        recursive(full);
      } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes(matchStr)) {
          results.push(full);
        }
      }
    }
  }
  recursive(dir);
  return results;
}

const root = path.join(__dirname, '../src');
console.log('--- Use Address on File ---');
console.log(searchFiles(root, 'Use Address on File'));

console.log('--- Health Active label ---');
console.log(searchFiles(root, 'Agency Information'));
