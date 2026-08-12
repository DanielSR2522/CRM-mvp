const fs = require('fs');

function searchDropzone(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchDropzone(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('FileDropzone')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('FileDropzone') || line.includes('maxSizeMB')) {
            console.log(`Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchDropzone('src');
