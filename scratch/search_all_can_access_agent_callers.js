const fs = require('fs');
const path = require('path');

function searchDir(dir, results = []) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchDir(p, results);
    } else if (p.endsWith('.sql') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) {
      results.push(p);
    }
  });
  return results;
}

const allFiles = searchDir('.');
console.log('====================================================');
console.log('SEARCHING ALL CALLS TO can_access_agent IN CODEBASE');
console.log('====================================================\n');

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('can_access_agent')) {
    console.log(`FILE: ${file}`);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('can_access_agent')) {
        console.log(`  Line ${i+1}: ${line.trim()}`);
      }
    });
  }
});
