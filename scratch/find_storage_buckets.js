const fs = require('fs');
const path = require('path');

function searchStorage(dir, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        searchStorage(fullPath, results);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.sql')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/storage\.from\(["']([^"']+)["']\)/g);
      if (matches) {
        matches.forEach(m => results.push({ file: path.relative(path.join(__dirname, '..'), fullPath), match: m }));
      }
    }
  }
  return results;
}

const root = path.join(__dirname, '../src');
const matches = searchStorage(root);
console.log('Storage bucket references:');
matches.forEach(m => console.log(`${m.file}: ${m.match}`));
