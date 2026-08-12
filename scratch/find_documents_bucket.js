const fs = require('fs');
const path = require('path');

function searchDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'scratch') {
        searchDir(filePath, fileList);
      }
    } else if (/\.(tsx?|jsx?)$/.test(file)) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const files = searchDir('src');

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('storage.from(')) {
    console.log(`\n=== ${f} ===`);
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (l.includes('storage.from(')) {
        console.log(`  L${idx+1}: ${l.trim()}`);
      }
    });
  }
});
