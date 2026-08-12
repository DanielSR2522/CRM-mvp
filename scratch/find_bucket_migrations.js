const fs = require('fs');
const path = require('path');

const migrationsDir = 'supabase/migrations';
const files = fs.readdirSync(migrationsDir);

files.forEach(f => {
  const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
  if (content.includes('storage.buckets') || content.includes('storage.objects')) {
    console.log(`\n=== ${f} ===`);
    console.log(content);
  }
});
