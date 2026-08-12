const fs = require('fs');

const files = fs.readdirSync('supabase/migrations');
files.forEach(f => {
  const text = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  if (text.includes('signature_requests')) {
    console.log(`\n=================== FILE: ${f} ===================`);
    console.log(text);
  }
});
