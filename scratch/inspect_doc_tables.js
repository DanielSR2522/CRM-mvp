const fs = require('fs');
const path = require('path');

const migrationsDir = 'supabase/migrations';
const files = fs.readdirSync(migrationsDir);

files.forEach(file => {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  if (/CREATE TABLE/i.test(content) && /doc|file|storage/i.test(content)) {
    console.log(`\n=== ${file} ===`);
    console.log(content.slice(0, 1000));
  }
});
