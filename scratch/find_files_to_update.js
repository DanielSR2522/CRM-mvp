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

console.log('=== FILES WITH SSN, PHONE, OR DATE RENDERING ===\n');

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(path.join(__dirname, '..'), file);

  const hasSSN = content.toLowerCase().includes('ssn') || content.toLowerCase().includes('social_security');
  const hasPhone = content.toLowerCase().includes('phone') || content.toLowerCase().includes('mobile');
  const hasDate = content.includes('toLocaleDateString') || content.includes('toLocaleString') || content.includes('dob') || content.includes('created_at') || content.includes('effective_date');

  if (hasSSN || hasPhone || hasDate) {
    console.log(`- ${relPath}: SSN=${hasSSN}, Phone=${hasPhone}, Date=${hasDate}`);
  }
});
