const fs = require('fs');

const migrationsDir = 'supabase/migrations';
const files = fs.readdirSync(migrationsDir);

console.log('--- Searching all migration files for signature_requests policies ---');
files.forEach(file => {
  const content = fs.readFileSync(`${migrationsDir}/${file}`, 'utf8');
  if (content.includes('signature_requests')) {
    console.log(`\n================ FILE: ${file} ================`);
    content.split('\n').forEach((line, idx) => {
      if (line.includes('signature_requests') || line.includes('POLICY') || line.includes('USING') || line.includes('CHECK')) {
        console.log(`Line ${idx+1}: ${line}`);
      }
    });
  }
});
