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

async function runAudit() {
  const { getSupabaseAdmin } = await import('../src/lib/supabaseAdmin');
  const supabase = getSupabaseAdmin();

  console.log('===========================================================');
  console.log('AUDITING CONSENT TEMPLATE DELETION BUG');
  console.log('===========================================================\n');

  // 1. Look for templates with internal_name like 'Da' or inactive templates
  const { data: templates, error: tErr } = await supabase
    .from('consent_templates')
    .select('*')
    .or('internal_name.ilike.%Da%,status.eq.inactive');

  console.log('Found matching templates:', templates);

  // 2. Check if any signature_requests reference template_id directly
  const { data: requests, error: rErr } = await supabase
    .from('signature_requests')
    .select('id, template_id, template_version_id');

  console.log('Total signature requests:', requests?.length);
  if (requests && requests.length > 0) {
    console.log('Sample requests:', requests.slice(0, 5));
  }

  // 3. Test deleting an unused inactive template
  const { data: agent } = await supabase.from('clients').select('agent_id').limit(1);
  const testAgentId = agent?.[0]?.agent_id || '00000000-0000-0000-0000-000000000000';

  const { data: newTpl, error: insErr } = await supabase
    .from('consent_templates')
    .insert({
      agent_id: testAgentId,
      created_by: testAgentId,
      internal_name: 'Test Inactive Deletion Tpl',
      public_title: 'Test Inactive Title',
      status: 'inactive',
      current_version: 1
    })
    .select('*')
    .single();

  console.log('Created test inactive template:', newTpl, insErr);

  if (newTpl) {
    const { data: newVer, error: vInsErr } = await supabase
      .from('consent_template_versions')
      .insert({
        template_id: newTpl.id,
        version_number: 1,
        content: { html: '<p>Test</p>' },
        consent_text: 'Test consent',
        variables_used: [],
        content_hash: 'hash123',
        created_by: testAgentId
      })
      .select('*')
      .single();

    console.log('Created version:', newVer, vInsErr);

    // Attempt deletion: Step A - Delete versions
    const { error: delVerErr } = await supabase
      .from('consent_template_versions')
      .delete()
      .eq('template_id', newTpl.id);

    console.log('Delete versions result:', delVerErr);

    // Attempt deletion: Step B - Delete template
    const { error: delTplErr } = await supabase
      .from('consent_templates')
      .delete()
      .eq('id', newTpl.id);

    console.log('Delete template result:', delTplErr);
  }
}

runAudit();
