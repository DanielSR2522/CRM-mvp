const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function auditDocsTablesAndStorage() {
  console.log('=== AUDITING POLICY DOCUMENT TABLES & STORAGE ===\n');

  // 1. Check policy_document_sections schema
  const { data: secSample, error: secErr } = await supabase.from('policy_document_sections').select('*').limit(1);
  console.log('1. policy_document_sections sample/error:', secSample, secErr);

  // 2. Check policy_documents schema
  const { data: docSample, error: docErr } = await supabase.from('policy_documents').select('*').limit(1);
  console.log('2. policy_documents sample/error:', docSample, docErr);

  // 3. Check storage bucket 'policy-documents'
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  console.log('3. Storage buckets:', buckets, bErr);

  // 4. Search migrations for policy_document_sections and policy_documents RLS policies
  console.log('\n--- Searching migration files for policy_document RLS policies ---');
  const files = fs.readdirSync('supabase/migrations');
  files.forEach(f => {
    const text = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
    if (text.includes('policy_document_sections') || text.includes('policy_documents') || text.includes('policy-documents')) {
      console.log(`\n=================== FILE: ${f} ===================`);
      text.split('\n').forEach((line, idx) => {
        if (line.includes('policy_document') || line.includes('POLICY') || line.includes('storage.objects')) {
          console.log(`Line ${idx+1}: ${line}`);
        }
      });
    }
  });
}

auditDocsTablesAndStorage();
