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

const rawOccurrences = {
  toLocaleDateString: [],
  toLocaleString: [],
  newDate: [],
  typeDate: [],
  ssn: [],
  phone: []
};

files.forEach(file => {
  const relPath = path.relative(path.join(__dirname, '..'), file);
  // Skip formatters themselves
  if (relPath.includes('src\\lib\\formatters')) return;

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimLine = line.trim();

    if (trimLine.includes('toLocaleDateString')) {
      rawOccurrences.toLocaleDateString.push({ file: relPath, line: lineNum, text: trimLine });
    }
    if (trimLine.includes('toLocaleString')) {
      rawOccurrences.toLocaleString.push({ file: relPath, line: lineNum, text: trimLine });
    }
    if (trimLine.includes('new Date(')) {
      rawOccurrences.newDate.push({ file: relPath, line: lineNum, text: trimLine });
    }
    if (trimLine.includes('type="date"') || trimLine.includes("type='date'")) {
      rawOccurrences.typeDate.push({ file: relPath, line: lineNum, text: trimLine });
    }
    if (trimLine.toLowerCase().includes('ssn') || trimLine.toLowerCase().includes('social_security')) {
      rawOccurrences.ssn.push({ file: relPath, line: lineNum, text: trimLine });
    }
    if (trimLine.toLowerCase().includes('phone') || trimLine.toLowerCase().includes('mobile') || trimLine.toLowerCase().includes('telephone')) {
      rawOccurrences.phone.push({ file: relPath, line: lineNum, text: trimLine });
    }
  });
});

console.log('=== SWEEP RESULTS ===');
console.log(`toLocaleDateString: ${rawOccurrences.toLocaleDateString.length}`);
console.log(`toLocaleString: ${rawOccurrences.toLocaleString.length}`);
console.log(`new Date(: ${rawOccurrences.newDate.length}`);
console.log(`type="date": ${rawOccurrences.typeDate.length}`);
console.log(`SSN occurrences: ${rawOccurrences.ssn.length}`);
console.log(`Phone occurrences: ${rawOccurrences.phone.length}`);

fs.writeFileSync(path.join(__dirname, 'sweep_raw.json'), JSON.stringify(rawOccurrences, null, 2));
