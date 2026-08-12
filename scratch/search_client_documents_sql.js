const fs = require('fs');

function searchSqlFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchSqlFiles(p);
    } else if (p.endsWith('.sql')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('client_documents')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('client_documents') || line.includes('CREATE TABLE')) {
            console.log(`Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchSqlFiles('.');
