const fs = require('fs');
const path = require('path');

function searchSql(dir, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        searchSql(fullPath, results);
      }
    } else if (file.endsWith('.sql') || file.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (/signed evidence|signed_document|cannot be deleted|signature_files/i.test(content)) {
        results.push({ fullPath, relPath: path.relative(path.join(__dirname, '..'), fullPath) });
      }
    }
  }
  return results;
}

const root = path.join(__dirname, '..');
const matches = searchSql(root);
console.log('Matches in repo:');
matches.forEach(m => console.log(m.relPath));
