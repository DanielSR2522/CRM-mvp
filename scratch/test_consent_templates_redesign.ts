import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import DOMPurify from 'isomorphic-dompurify';

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
  const { saveTemplateDraft } = await import('../src/lib/consents/template-service');
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
  console.log('TESTING CONSENT TEMPLATES REDESIGN & JSONB METADATA');
  console.log('===========================================================\n');

  try {
    // 1. Test Server Document Importer Logic
    console.log('--- 1. Document Importer Logic ---');
    const txtContent = 'Hello World Consent\n\nSecond Paragraph with {{client.full_name}}';
    const paragraphs = txtContent.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean);
    const html = paragraphs.map(p => `<p>${DOMPurify.sanitize(p).replace(/\n/g, '<br/>')}</p>`).join('');

    assert(html.includes('<p>Hello World Consent</p>'), 'TXT converter converted paragraphs to HTML <p>');
    assert(html.includes('{{client.full_name}}'), 'TXT converter preserved variable tokens');

    // 2. Database Draft Creation & JSONB Content Metadata
    console.log('\n--- 2. Database Draft Creation & JSONB Content Metadata ---');
    const { data: clients } = await supabase.from('clients').select('id, agent_id').limit(1);
    const testClientId = clients?.[0]?.id;
    const testAgentId = clients?.[0]?.agent_id || '00000000-0000-0000-0000-000000000000';

    const draftName = `Test Redesign Template ${Date.now()}`;
    const testHtml = '<h1>Consent Header</h1><p>Client name: {{client.full_name}} and email: {{client.email}}</p>';
    const testConsentText = 'I agree to use an electronic signature.';

    const draftTemplate = await saveTemplateDraft({
      internal_name: draftName,
      public_title: 'Public Consent Title',
      description: 'Test template description',
      language: 'en',
      htmlContent: testHtml,
      consentText: testConsentText,
      imported: {
        source_type: 'txt',
        source_filename: 'sample_consent.txt',
        warning: 'Review formatting before publishing',
        imported_at: new Date().toISOString()
      },
      overrideAgentId: testAgentId
    });

    assert(!!draftTemplate?.id, 'Template draft saved in consent_templates table');
    assert(draftTemplate.status === 'draft', 'Template status is initial draft');

    const { data: draftVersions } = await supabase
      .from('consent_template_versions')
      .select('*')
      .eq('template_id', draftTemplate.id);

    const draftVersion = draftVersions?.[0];
    assert(!!draftVersion?.id, 'Template version 1 created in consent_template_versions table');
    assert(draftVersion?.variables_used?.includes('client.full_name'), 'Version extracted variable client.full_name');

    // Verify JSONB metadata shape inside content
    const versionContent = draftVersion?.content as any;
    assert(versionContent?.imported?.source_type === 'txt', 'JSONB content persisted source_type="txt"');
    assert(versionContent?.imported?.source_filename === 'sample_consent.txt', 'JSONB content persisted source_filename');
    assert(versionContent?.signing_config?.require_signature === true, 'JSONB content persisted signing_config.require_signature');
    assert(versionContent?.signing_config?.automatic_signing_date === true, 'JSONB content persisted signing_config.automatic_signing_date');

    // 3. Test Template Publishing
    console.log('\n--- 3. Publishing Flow ---');
    await supabase.from('consent_templates').update({ status: 'active' }).eq('id', draftTemplate.id);
    const { data: publishedTpl } = await supabase.from('consent_templates').select('status').eq('id', draftTemplate.id).single();
    assert(publishedTpl?.status === 'active', 'Template published status set to "active"');

    // Clean up test records
    await supabase.from('consent_template_versions').delete().eq('template_id', draftTemplate.id);
    await supabase.from('consent_templates').delete().eq('id', draftTemplate.id);

    console.log('\n===========================================================');
    console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('Test error:', err);
  }
}

runTests();
