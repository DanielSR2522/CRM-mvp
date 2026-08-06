const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.next')) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });
  return arrayOfFiles;
}

const srcDir = path.join(__dirname, '../src');
const files = getAllFiles(srcDir);

const terms = ['DEFAULT_BUSINESS_LINES', 'setSelectedLines', 'business_lines', 'saveBusinessLines', 'fetchAgentBusinessLines', 'useBusinessLines'];

console.log('=== SEARCH RESULTS FOR BUSINESS LINES REFERENCES ===\n');

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    terms.forEach(term => {
      if (line.includes(term)) {
        const relPath = path.relative(path.join(__dirname, '..'), file);
        console.log(`${relPath}:${idx + 1}:${term} -> ${line.trim()}`);
      }
    });
  });
});
