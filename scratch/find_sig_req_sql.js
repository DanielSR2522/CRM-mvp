const fs = require('fs');

const files = fs.readdirSync('supabase/migrations');
files.forEach(f => {
  const content = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  if (content.toLowerCase().includes('signature_requests')) {
    console.log(`FOUND IN: ${f}`);
  }
});
