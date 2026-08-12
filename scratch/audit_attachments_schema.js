const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function auditAttachmentsSchema() {
  console.log('--- 1. Auditing client_note_attachments schema ---');
  const { data, error } = await supabase.from('client_note_attachments').select('*').limit(1);
  if (error) {
    console.error('Error querying client_note_attachments:', error);
  } else {
    console.log('Sample row / columns:', data);
  }

  // Search migration files for client_note_attachments table creation or policies
  console.log('\n--- Searching migration files for client_note_attachments ---');
  const files = fs.readdirSync('supabase/migrations');
  files.forEach(f => {
    const text = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
    if (text.includes('client_note_attachments')) {
      console.log(`\n=================== FILE: ${f} ===================`);
      text.split('\n').forEach((line, idx) => {
        if (line.includes('client_note_attachments') || line.includes('CREATE TABLE') || line.includes('POLICY')) {
          console.log(`Line ${idx+1}: ${line}`);
        }
      });
    }
  });
}

auditAttachmentsSchema();
