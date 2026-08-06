const fs = require('fs');
const path = require('path');

function searchForCreds(dir, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === '.next') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        searchForCreds(fullPath, maxDepth, currentDepth + 1);
      } else if (file.endsWith('.json') || file.endsWith('.toml') || file.endsWith('.env') || file.includes('supabase') || file.includes('config')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('postgres:') || content.includes('walgdtoolzpdhgxzejph') || content.includes('db.')) {
          console.log('Found creds reference in:', fullPath);
          const lines = content.split('\n');
          lines.forEach(l => {
            if (l.includes('db.') || l.includes('postgres:') || l.includes('pooler') || l.includes('PASSWORD')) {
              console.log('  ', l.trim());
            }
          });
        }
      }
    }
  } catch (e) {}
}

console.log('Searching project & parent dirs for DB credentials...');
searchForCreds(path.join(__dirname, '..'));
searchForCreds('C:\\Users\\SEBASTIAN\\.gemini');
