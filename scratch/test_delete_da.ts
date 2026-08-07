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

async function runDaTest() {
  const { deleteTemplate } = await import('../src/lib/consents/template-service');
  const { getSupabaseAdmin } = await import('../src/lib/supabaseAdmin');

  const supabase = getSupabaseAdmin();
  const daId = '46916674-d3ce-4dba-848a-aa67ce4b31c0';

  console.log('--- Checking Template Da ---');
  const { data: tpl } = await supabase.from('consent_templates').select('*').eq('id', daId).single();
  console.log('Template Da record:', tpl);

  const { data: versions } = await supabase.from('consent_template_versions').select('*').eq('template_id', daId);
  console.log('Template Da versions count:', versions?.length, versions);

  const versionIds = (versions || []).map(v => v.id);

  const { count: reqCountByVersion } = await supabase
    .from('signature_requests')
    .select('id', { count: 'exact', head: true })
    .in('template_version_id', versionIds.length ? versionIds : ['00000000-0000-0000-0000-000000000000']);
  console.log('Signature requests count by version:', reqCountByVersion);

  const { count: reqCountByTemplate } = await supabase
    .from('signature_requests')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', daId);
  console.log('Signature requests count by template_id:', reqCountByTemplate);

  // Test calling deleteTemplate with override logic
  try {
    const res = await deleteTemplate(daId);
    console.log('deleteTemplate result for Da:', res);
  } catch (err: any) {
    console.error('deleteTemplate error for Da:', err);
  }
}

runDaTest();
