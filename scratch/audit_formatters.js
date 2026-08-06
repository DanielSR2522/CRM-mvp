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

const auditResults = {
  dateReferences: [],
  typeDateInputs: [],
  ssnFields: [],
  phoneFields: []
};

files.forEach(file => {
  const relPath = path.relative(path.join(__dirname, '..'), file);
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Date checks
    if (line.includes('toLocaleDateString') || line.includes('toLocaleString') || line.includes('new Date(')) {
      auditResults.dateReferences.push({ file: relPath, line: lineNum, text: line.trim() });
    }
    if (line.includes('type="date"') || line.includes("type='date'")) {
      auditResults.typeDateInputs.push({ file: relPath, line: lineNum, text: line.trim() });
    }

    // SSN checks
    if (line.toLowerCase().includes('ssn') || line.toLowerCase().includes('social_security') || line.toLowerCase().includes('taxmembersensitivefield')) {
      auditResults.ssnFields.push({ file: relPath, line: lineNum, text: line.trim() });
    }

    // Phone checks
    if (line.toLowerCase().includes('phone') || line.toLowerCase().includes('mobile')) {
      auditResults.phoneFields.push({ file: relPath, line: lineNum, text: line.trim() });
    }
  });
});

console.log('=== AUDIT SUMMARY ===');
console.log(`- Files scanned: ${files.length}`);
console.log(`- Date reference lines: ${auditResults.dateReferences.length}`);
console.log(`- type="date" inputs: ${auditResults.typeDateInputs.length}`);
console.log(`- SSN field lines: ${auditResults.ssnFields.length}`);
console.log(`- Phone field lines: ${auditResults.phoneFields.length}`);

fs.writeFileSync(path.join(__dirname, 'audit_report.json'), JSON.stringify(auditResults, null, 2));
console.log('Detailed audit written to scratch/audit_report.json');
