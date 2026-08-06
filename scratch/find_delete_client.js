const fs = require('fs');
const path = require('path');

function searchDir(dir, pattern, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        searchDir(fullPath, pattern, results);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.sql')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (pattern.test(content)) {
        results.push({ fullPath, relPath: path.relative(path.join(__dirname, '..'), fullPath) });
      }
    }
  }
  return results;
}

const root = path.join(__dirname, '../src');
console.log('Searching for "signature" or "delete" in src:');
const matches = searchDir(root, /signature_request|deleteClient|Delete failed/i);
matches.forEach(m => console.log(m.relPath));
