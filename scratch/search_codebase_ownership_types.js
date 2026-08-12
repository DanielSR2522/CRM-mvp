const fs = require('fs');
const path = require('path');

function searchFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        searchFiles(filePath, fileList);
      }
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.sql') || filePath.endsWith('.json') || filePath.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const allFiles = searchFiles('.');
console.log('--- Occurrences of policy_ownership_type, personal, company, individual in codebase ---');

allFiles.forEach(file => {
  if (file.includes('scratch\\') || file.includes('scratch/')) return;
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('policy_ownership_type') || content.includes('chk_policy_ownership_type') || content.includes("'individual'") || content.includes('"individual"')) {
    console.log(`\nFILE: ${file}`);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('policy_ownership_type') || line.includes('chk_policy_ownership_type') || line.includes('individual') || line.includes('company') || line.includes('personal')) {
        if (line.includes('policy_ownership_type') || line.includes('individual') || line.includes('company') || line.includes('pcClientType') || line.includes('pc_client_type')) {
          console.log(`  Line ${i+1}: ${line.trim()}`);
        }
      }
    });
  }
});
