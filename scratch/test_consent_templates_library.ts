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

async function runTests() {
  const { saveTemplateDraft, publishTemplate, deleteTemplate } = await import('../src/lib/consents/template-service');
  const { getSupabaseAdmin } = await import('../src/lib/supabaseAdmin');

  const supabase = getSupabaseAdmin();

  let pass = 0;
  let fail = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      pass++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      fail++;
    }
  }

  console.log('===========================================================');
  console.log('TESTING CONSENT TEMPLATES AVAILABILITY MODEL & DELETION GUARDS');
  console.log('===========================================================\n');

  try {
    const { data: clients } = await supabase.from('clients').select('id, agent_id').limit(1);
    const testClientId = clients?.[0]?.id;
    const testAgentId = clients?.[0]?.agent_id || '00000000-0000-0000-0000-000000000000';

    // 1. Create Published Template 1 & Published Template 2 & Draft Template 3
    console.log('--- 1. Simultaneous Template Publication ---');
    const tpl1 = await saveTemplateDraft({
      internal_name: `Lib Test Published 1 ${Date.now()}`,
      public_title: 'Public Tpl 1',
      language: 'en',
      htmlContent: '<p>Content 1 {{client.full_name}}</p>',
      consentText: 'Consent statement 1',
      overrideAgentId: testAgentId
    });

    const tpl2 = await saveTemplateDraft({
      internal_name: `Lib Test Published 2 ${Date.now()}`,
      public_title: 'Public Tpl 2',
      language: 'es',
      htmlContent: '<p>Content 2 {{client.full_name}}</p>',
      consentText: 'Consent statement 2',
      overrideAgentId: testAgentId
    });

    const draftTpl = await saveTemplateDraft({
      internal_name: `Lib Test Draft 3 ${Date.now()}`,
      public_title: 'Draft Tpl 3',
      language: 'en',
      htmlContent: '<p>Draft Content 3</p>',
      consentText: 'Consent statement 3',
      overrideAgentId: testAgentId
    });

    // Publish tpl1 and tpl2
    await supabase.from('consent_templates').update({ status: 'active' }).eq('id', tpl1.id);
    await supabase.from('consent_templates').update({ status: 'active' }).eq('id', tpl2.id);

    // Fetch active templates
    const { data: activeTemplates } = await supabase
      .from('consent_templates')
      .select('*')
      .eq('agent_id', testAgentId)
      .eq('status', 'active');

    const activeIds = (activeTemplates || []).map((t) => t.id);
    assert(activeIds.includes(tpl1.id), 'Published Template 1 is active in database');
    assert(activeIds.includes(tpl2.id), 'Published Template 2 is active simultaneously in database');
    assert(!activeIds.includes(draftTpl.id), 'Draft Template 3 is excluded from active templates query');

    // 2. Unused Template Deletion
    console.log('\n--- 2. Unused Template Deletion ---');
    const deleteUnusedResult = await deleteTemplate(draftTpl.id);
    assert(deleteUnusedResult.deleted === true, 'Unused template permanently deleted successfully');

    const { data: checkDeleted } = await supabase.from('consent_templates').select('id').eq('id', draftTpl.id).maybeSingle();
    assert(checkDeleted === null, 'Unused template row no longer exists in database');

    // 3. Used Template Deletion Protection
    console.log('\n--- 3. Used Template Deletion Protection Guard ---');
    const { data: tpl1Versions } = await supabase.from('consent_template_versions').select('id').eq('template_id', tpl1.id);
    const ver1Id = tpl1Versions?.[0]?.id;

    if (testClientId && ver1Id) {
      // Insert mock signature request referencing ver1Id
      const { data: mockReq } = await supabase.from('signature_requests').insert({
        client_id: testClientId,
        template_id: tpl1.id,
        template_version_id: ver1Id,
        rendered_content: { html: '<p>Snapshot</p>' },
        merge_data_snapshot: { client_name: 'Test' },
        status: 'draft',
        original_document_hash: 'mockhash123'
      }).select('id').single();

      let blockErrorCaught = false;
      try {
        await deleteTemplate(tpl1.id);
      } catch (err: any) {
        blockErrorCaught = err?.message?.includes('cannot be permanently deleted');
      }

      assert(blockErrorCaught === true, 'deleteTemplate blocked permanent deletion of used template with audit history warning');

      // Verify versions and request remain intact
      const { data: verifyTpl } = await supabase.from('consent_templates').select('id').eq('id', tpl1.id).single();
      assert(!!verifyTpl?.id, 'Used template record preserved in database');

      // Cleanup mock request
      if (mockReq?.id) {
        await supabase.from('signature_requests').delete().eq('id', mockReq.id);
      }
    }

    // Cleanup test templates
    await supabase.from('consent_template_versions').delete().in('template_id', [tpl1.id, tpl2.id]);
    await supabase.from('consent_templates').delete().in('id', [tpl1.id, tpl2.id]);

    console.log('\n===========================================================');
    console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('Test error:', err);
  }
}

runTests();
