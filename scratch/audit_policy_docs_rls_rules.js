const fs = require('fs');

const files = fs.readdirSync('supabase/migrations');
files.forEach(f => {
  const text = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  if (text.includes('policy_document_sections') || text.includes('policy_documents')) {
    console.log(`\n=================== FILE: ${f} ===================`);
    text.split('\n').forEach((line, idx) => {
      if (line.includes('CREATE POLICY') || line.includes('DROP POLICY') || line.includes('USING') || line.includes('WITH CHECK')) {
        console.log(`Line ${idx+1}: ${line}`);
      }
    });
  }
});
