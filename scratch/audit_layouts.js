const fs = require('fs');
const path = require('path');

function searchFiles(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(searchFiles(fullPath));
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const pages = searchFiles('src/app');
console.log('Total page files found:', pages.length);

pages.forEach(p => {
  const content = fs.readFileSync(p, 'utf8');
  const maxW = content.match(/max-w-[^\s"'`>]+/g) || [];
  const container = content.match(/container[^\s"'`>]*/g) || [];
  const padding = content.match(/p[xy]?-\d+/g) || [];
  
  const relPath = p.replace(/\\/g, '/');
  console.log(`\n=== ${relPath} ===`);
  if (maxW.length) console.log('  max-w:', [...new Set(maxW)].join(', '));
  if (container.length) console.log('  container:', [...new Set(container)].join(', '));
});
