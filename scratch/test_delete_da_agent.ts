import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadEnv();

async function testDeleteDa() {
  const { getSupabaseAdmin } = await import('../src/lib/supabaseAdmin');
  const supabase = getSupabaseAdmin();
  const daId = '46916674-d3ce-4dba-848a-aa67ce4b31c0';

  console.log('--- Testing Deletion of Template Da ---');

  // Check signature requests referencing Da
  const { count: reqCountTpl } = await supabase
    .from('signature_requests')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', daId);

  console.log('Requests referencing template_id:', reqCountTpl);

  // Attempt deletion of versions
  const { error: vErr } = await supabase
    .from('consent_template_versions')
    .delete()
    .eq('template_id', daId);
  console.log('Delete versions error:', vErr);

  // Attempt deletion of template
  const { error: tErr } = await supabase
    .from('consent_templates')
    .delete()
    .eq('id', daId);
  console.log('Delete template error:', tErr);
}

testDeleteDa();
