const fs = require('fs');

function searchBucketNames(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') searchBucketNames(p);
    } else if (p.endsWith('.sql') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('client-documents') || text.includes('policy-documents') || text.includes('storage.buckets')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('client-documents') || line.includes('policy-documents') || line.includes('buckets') || line.includes('.from(')) {
            console.log(`Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchBucketNames('.');
