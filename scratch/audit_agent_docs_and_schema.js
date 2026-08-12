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
    } else if (/\.(tsx?|jsx?|html|json|sql)$/.test(file)) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const allFiles = searchDir('.');

console.log('=== 1. AGENT INFORMATION / PROFILE PAGES ===');
allFiles.filter(f => /agent|profile|settings/i.test(f)).forEach(f => {
  console.log(f);
});

console.log('\n=== 2. DOCUMENT TABLES IN MIGRATIONS ===');
allFiles.filter(f => f.includes('supabase/migrations')).forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (/CREATE TABLE.*doc/i.test(content) || /documents/i.test(content)) {
    console.log(`- ${f}`);
  }
});

console.log('\n=== 3. DOCUMENT PREVIEW / UPLOAD COMPONENTS ===');
allFiles.filter(f => /DocumentPreview|DocumentModal|upload/i.test(f)).forEach(f => {
  console.log(f);
});
