import fs from 'fs';
import path from 'path';

// Load .env.local manually
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

import { getSupabaseAdmin } from '../src/lib/supabaseAdmin';

console.log('===========================================================');
console.log('TESTING COMPLETE ATOMIC CLIENT CASCADE DELETION');
console.log('WITH SIGNED EVIDENCE FILE GUARD OVERRIDE');
console.log('===========================================================\n');

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

async function runTests() {
  const supabase = getSupabaseAdmin();

  const testAgentId = '4f698c2f-f9e0-42d1-996e-a9ee4a574ea9';
  const unauthorizedAgentId = '00000000-0000-0000-0000-000000000000';

  // Ensure a test template & version exists for testAgentId
  let templateId = '';
  let versionId = '';

  const { data: existingTpl } = await supabase
    .from('consent_templates')
    .select('id, consent_template_versions(id)')
    .eq('agent_id', testAgentId)
    .limit(1)
    .maybeSingle();

  if (existingTpl && existingTpl.consent_template_versions && existingTpl.consent_template_versions.length > 0) {
    templateId = existingTpl.id;
    versionId = existingTpl.consent_template_versions[0].id;
  } else {
    const { data: newTpl } = await supabase
      .from('consent_templates')
      .insert({
        agent_id: testAgentId,
        created_by: testAgentId,
        internal_name: 'Cascade Test Template',
        public_title: 'Cascade Test Title',
        language: 'en',
        status: 'active',
      })
      .select('id')
      .single();

    if (newTpl) {
      templateId = newTpl.id;
      const { data: newVer } = await supabase
        .from('consent_template_versions')
        .insert({
          template_id: templateId,
          version_number: 1,
          created_by: testAgentId,
          content: { blocks: [] },
          consent_text: 'I agree to e-sign.',
          variables_used: [],
        })
        .select('id')
        .single();
      if (newVer) versionId = newVer.id;
    }
  }

  // SCENARIO 1: Client without related data
  console.log('\n--- Scenario 1: Delete client without related data ---');
  const { data: c1 } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Test Empty Client' })
    .select('id')
    .single();

  assert(Boolean(c1?.id), 'Created test empty client');

  if (c1?.id) {
    const { data: res1, error: err1 } = await supabase.rpc('delete_client_cascade', {
      p_client_id: c1.id,
      p_agent_id: testAgentId,
    });

    assert(Boolean(!err1 && res1 && res1.success), 'Successfully deleted empty client via delete_client_cascade RPC');

    const { data: checkC1 } = await supabase.from('clients').select('id').eq('id', c1.id).maybeSingle();
    assert(checkC1 === null, 'Verified client record is removed from DB');
  }

  // SCENARIO 2: Unauthorized deletion attempt
  console.log('\n--- Scenario 2: Unauthorized deletion attempt ---');
  const { data: c2 } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Test Security Client' })
    .select('id')
    .single();

  if (c2?.id) {
    const { error: err2 } = await supabase.rpc('delete_client_cascade', {
      p_client_id: c2.id,
      p_agent_id: unauthorizedAgentId,
    });

    assert(Boolean(err2 && err2.message && err2.message.includes('CLIENT_NOT_FOUND_OR_UNAUTHORIZED')), 'Unauthorized deletion attempt rejected');

    await supabase.rpc('delete_client_cascade', { p_client_id: c2.id, p_agent_id: testAgentId });
  }

  // SCENARIO 3: Client with signed consent and signed_document evidence file
  console.log('\n--- Scenario 3: Delete client with signed consent AND signed_document evidence file ---');
  const { data: c3 } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Test Signed Evidence Client' })
    .select('id')
    .single();

  if (c3?.id && templateId && versionId) {
    const { data: sigReq } = await supabase
      .from('signature_requests')
      .insert({
        client_id: c3.id,
        template_id: templateId,
        template_version_id: versionId,
        created_by: testAgentId,
        title: 'Test Signed Evidence Request',
        rendered_content: { blocks: [] },
        status: 'signed',
        signed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    assert(Boolean(sigReq?.id), 'Created signed consent request for test client');

    if (sigReq?.id) {
      // Insert signature_file with file_type = 'signed_document' and valid 64-char sha256_hash
      const { data: sigFile, error: fileInsErr } = await supabase
        .from('signature_files')
        .insert({
          request_id: sigReq.id,
          file_type: 'signed_document',
          storage_bucket: 'signed-documents',
          storage_path: `signed-documents/${sigReq.id}/test_evidence.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 1024,
          sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        })
        .select('id')
        .single();

      if (fileInsErr) console.error('signature_file insert error:', fileInsErr);
      assert(Boolean(sigFile?.id), 'Created signed_document evidence file');

      // Test 3A: Direct deletion outside RPC should FAIL
      if (sigFile?.id) {
        const { error: directDelErr } = await supabase.from('signature_files').delete().eq('id', sigFile.id);
        assert(Boolean(directDelErr && directDelErr.message && directDelErr.message.includes('is signed evidence')), 'Direct deletion of signed evidence outside RPC was blocked');
      }

      // Test 3B: Cascade deletion via delete_client_cascade should SUCCEED
      const { data: res3, error: err3 } = await supabase.rpc('delete_client_cascade', {
        p_client_id: c3.id,
        p_agent_id: testAgentId,
      });

      assert(Boolean(!err3 && res3 && res3.success), 'Successfully deleted client with signed evidence file via delete_client_cascade RPC');

      // Verify orphan check
      const { data: orphanFile } = await supabase.from('signature_files').select('id').eq('id', sigFile?.id).maybeSingle();
      const { data: orphanSig } = await supabase.from('signature_requests').select('id').eq('id', sigReq.id).maybeSingle();
      const { data: orphanClient } = await supabase.from('clients').select('id').eq('id', c3.id).maybeSingle();

      assert(orphanFile === null && orphanSig === null && orphanClient === null, 'Verified signature file, request, and client were deleted without orphans remaining');
    }
  }

  // SCENARIO 4: Client with health policies and P&C policies
  console.log('\n--- Scenario 4: Delete client with health and P&C policies ---');
  const { data: c4 } = await supabase
    .from('clients')
    .insert({ agent_id: testAgentId, full_name: 'Test Policy Client' })
    .select('id')
    .single();

  if (c4?.id) {
    const { data: pol } = await supabase
      .from('policies')
      .insert({
        client_id: c4.id,
        policy_number: 'POL-TEST-999',
        policy_type: 'Auto',
        status: 'Active',
      })
      .select('id')
      .single();

    const { data: hpol } = await supabase
      .from('health_policies')
      .insert({
        client_id: c4.id,
        policy_status: 'Active',
        plan_name: 'Silver Health Plan',
      })
      .select('id')
      .single();

    assert(Boolean(pol?.id) && Boolean(hpol?.id), 'Created P&C policy and Health policy for client');

    const { data: res4, error: err4 } = await supabase.rpc('delete_client_cascade', {
      p_client_id: c4.id,
      p_agent_id: testAgentId,
    });

    assert(Boolean(!err4 && res4 && res4.success), 'Successfully deleted client with policies via RPC');

    const { data: orphanPol } = await supabase.from('policies').select('id').eq('id', pol?.id).maybeSingle();
    const { data: orphanHpol } = await supabase.from('health_policies').select('id').eq('id', hpol?.id).maybeSingle();
    assert(orphanPol === null && orphanHpol === null, 'Verified policies were deleted without orphans remaining');
  }

  console.log('\n===========================================================');
  console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runTests().catch(err => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
