const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDb() {
  console.log('--- Inspecting DB ---');

  // Check client_notes
  const resClientNotes = await supabase.from('client_notes').select('*').limit(1);
  console.log('client_notes select result:', { data: resClientNotes.data, error: resClientNotes.error });

  // Check client_note_attachments
  const resClientNoteAtt = await supabase.from('client_note_attachments').select('*').limit(1);
  console.log('client_note_attachments select result:', { data: resClientNoteAtt.data, error: resClientNoteAtt.error });

  // Check policy_notes
  const resPolicyNotes = await supabase.from('policy_notes').select('*').limit(1);
  console.log('policy_notes select result:', { data: resPolicyNotes.data, error: resPolicyNotes.error });

  // Check health_policy_notes
  const resHealthNotes = await supabase.from('health_policy_notes').select('*').limit(1);
  console.log('health_policy_notes select result:', { data: resHealthNotes.data, error: resHealthNotes.error });

  // Check agent_shared_access
  const resSharedAccess = await supabase.from('agent_shared_access').select('*').limit(1);
  console.log('agent_shared_access select result:', { data: resSharedAccess.data, error: resSharedAccess.error });
}

inspectDb();
