const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectColumns() {
  // Let's do an invalid query to force Supabase/PostgREST to output column list or error
  const { data, error } = await supabase.from('client_note_attachments').select('non_existent_col').limit(1);
  console.log('Error info containing columns:', error);

  // Search all repository files for client_note_attachments definition or usages
  console.log('\n--- Codebase search for client_note_attachments ---');
  function searchFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const p = `${dir}/${file}`;
      if (fs.statSync(p).isDirectory()) {
        if (file !== 'node_modules' && file !== '.next' && file !== '.git') searchFiles(p);
      } else if (p.endsWith('.sql') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) {
        const text = fs.readFileSync(p, 'utf8');
        if (text.includes('client_note_attachments')) {
          console.log(`FILE: ${p}`);
          text.split('\n').forEach((line, i) => {
            if (line.includes('client_note_attachments')) console.log(`  Line ${i+1}: ${line.trim()}`);
          });
        }
      }
    });
  }
  searchFiles('.');
}

inspectColumns();
