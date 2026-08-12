const fs = require('fs');

function findBucketCreation(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') findBucketCreation(p);
    } else if (p.endsWith('.sql')) {
      const text = fs.readFileSync(p, 'utf8');
      if (text.includes('storage.buckets') || text.includes('storage.objects')) {
        console.log(`\n=================== FILE: ${p} ===================`);
        text.split('\n').forEach((line, idx) => {
          if (line.includes('storage.buckets') || line.includes('storage.objects') || line.includes('bucket_id')) {
            console.log(`Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

findBucketCreation('.');
