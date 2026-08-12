const fs = require('fs');

const files = fs.readdirSync('supabase/migrations');
files.forEach(f => {
  const content = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  if (content.includes('signature_requests')) {
    console.log(`\n=================== FILE: ${f} ===================`);
    content.split('\n').forEach((line, idx) => {
      if (line.includes('signature_requests') || line.includes('POLICY') || line.includes('CREATE TABLE')) {
        console.log(`Line ${idx+1}: ${line}`);
      }
    });
  }
});
