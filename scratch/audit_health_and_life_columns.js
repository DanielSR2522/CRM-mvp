const fs = require('fs');

function searchSqlForDocTables(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchSqlForDocTables(p);
    } else if (p.endsWith('.sql')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('health_policy_documents') || text.includes('life_policy_documents')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('CREATE TABLE') || line.includes('file_name') || line.includes('storage_path') || line.includes('health_policy_id') || line.includes('life_policy_id')) {
            console.log(`Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchSqlForDocTables('.');
