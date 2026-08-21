const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fp = path.join(dir, f);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      searchDir(fp);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const text = fs.readFileSync(fp, 'utf8');
      if (text.includes('channel(') || text.includes('on(') || text.includes('postgres_changes')) {
        console.log(`File: ${fp}`);
      }
    }
  }
}

searchDir(path.join(__dirname, 'src'));
