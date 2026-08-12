const fs = require('fs');

function searchDocComponents(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchDocComponents(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('health-policy-documents') || text.includes('life-documents') || text.includes('Upload Document') || text.includes('client-documents')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('storage') || line.includes('upload') || line.includes('Modal') || line.includes('maxSize') || line.includes('15') || line.includes('20')) {
            console.log(`Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchDocComponents('src');
