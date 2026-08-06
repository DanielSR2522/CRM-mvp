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
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });
  return arrayOfFiles;
}

const srcDir = path.join(__dirname, '../src');
const files = getAllFiles(srcDir);

console.log('=== SEARCHING FOR SSN RENDERING OCCURRENCES ===\n');

files.forEach(file => {
  const relPath = path.relative(path.join(__dirname, '..'), file);
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trim = line.trim();

    if (
      trim.includes('.ssn') ||
      trim.includes('ssn}') ||
      trim.includes('ssn ||') ||
      trim.includes('ssn ?') ||
      trim.includes('social_security') ||
      trim.includes('tax_id') ||
      trim.includes('co_applicant_ssn')
    ) {
      console.log(`${relPath}:${lineNum} -> ${trim}`);
    }
  });
});
