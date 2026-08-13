const fs = require('fs');
const path = require('path');

function searchDir(dir, patterns) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath, patterns);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      patterns.forEach(pat => {
        if (content.includes(pat)) {
          console.log(`FOUND "${pat}" in:`, fullPath);
        }
      });
    }
  }
}

searchDir('C:\\Users\\SEBASTIAN\\.gemini\\antigravity\\scratch\\crm-mvp\\src', [
  'ModuleDocumentsManager',
  'activeTab === \'supplemental\'',
  'activeTab===\'supplemental\'',
  'supplemental_policies',
  'module_type: \'supplemental\'',
  'module_type:\'supplemental\''
]);
