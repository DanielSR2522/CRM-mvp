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

async function runStatusDeletionTests() {
  const { getSupabaseAdmin } = await import('../src/lib/supabaseAdmin');
  const { deleteTemplate } = await import('../src/lib/consents/template-service');
  const { sha256Hex, canonicalize } = await import('../src/lib/consents/template-blocks');

  const supabase = getSupabaseAdmin();
  const statuses: Array<'draft' | 'active' | 'inactive' | 'archived'> = ['draft', 'active', 'inactive', 'archived'];

  const { data: clients } = await supabase.from('clients').select('id, agent_id').limit(1);
  const testAgentId = clients?.[0]?.id ? clients[0].agent_id : '00000000-0000-0000-0000-000000000000';

  console.log('===========================================================');
  console.log('TESTING DELETION ACROSS ALL TEMPLATE STATUSES');
  console.log('===========================================================\n');

  let pass = 0;
  let fail = 0;

  for (const status of statuses) {
    console.log(`--- Testing Status: ${status} ---`);

    // 1. Create template
    const { data: tpl, error: tErr } = await supabase
      .from('consent_templates')
      .insert({
        agent_id: testAgentId,
        created_by: testAgentId,
        internal_name: `Del Test ${status} ${Date.now()}`,
        public_title: `Title ${status}`,
        status: status,
        current_version: 1,
        archived_at: status === 'archived' ? new Date().toISOString() : null
      })
      .select('*')
      .single();

    if (tErr || !tpl) {
      console.error(`❌ Failed to create ${status} template:`, tErr);
      fail++;
      continue;
    }

    const content = { html: '<p>Test</p>' };
    const consent_text = 'Test consent';
    const hash = await sha256Hex(canonicalize({ content, consent_text, variables_used: [] }));

    // 2. Create version
    const { data: ver, error: vErr } = await supabase
      .from('consent_template_versions')
      .insert({
        template_id: tpl.id,
        version_number: 1,
        content,
        consent_text,
        variables_used: [],
        content_hash: hash,
        created_by: testAgentId
      })
      .select('*')
      .single();

    if (vErr || !ver) {
      console.error(`❌ Failed to create version for ${status} template:`, vErr);
      fail++;
      continue;
    }

    // 3. Delete template using deleteTemplate
    try {
      const res = await deleteTemplate(tpl.id, supabase);
      if (res.deleted) {
        console.log(`✅ PASS: ${status} template deleted successfully`);
        pass++;
      } else {
        console.error(`❌ FAIL: ${status} template deletion returned false`);
        fail++;
      }
    } catch (err: any) {
      console.error(`❌ FAIL: ${status} template deletion failed:`, err?.message || err);
      fail++;
    }
  }

  console.log('\n===========================================================');
  console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runStatusDeletionTests();
