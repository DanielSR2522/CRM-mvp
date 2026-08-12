const fs = require('fs');

function searchFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchFiles(p);
    } else if (p.endsWith('.sql')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('policy_document_sections') || text.includes('policy_documents')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('CREATE TABLE') || line.includes('POLICY') || line.includes('policy_document')) {
            console.log(`Line ${idx+1}: ${line}`);
          }
        });
      }
    }
  });
}

searchFiles('.');
