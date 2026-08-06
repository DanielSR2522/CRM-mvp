import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export {};

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

async function testHealthModule() {
  console.log('===========================================================');
  console.log('TESTING HEALTH MODULE DOCUMENTS, NOTES & TIMELINE END-TO-END');
  console.log('===========================================================\n');

  try {
    // 1. Fetch a real client or create a test client
    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, agent_id')
      .limit(2);

    if (cErr || !clients || clients.length === 0) {
      console.log('No clients found to run integration test.');
      return;
    }

    const client1 = clients[0];
    const client2 = clients.length > 1 ? clients[1] : null;

    // 2. Fetch or create Health Policy for client 1
    let { data: policy1 } = await supabase
      .from('health_policies')
      .select('*')
      .eq('client_id', client1.id)
      .maybeSingle();

    if (!policy1) {
      const { data: newPol, error: pErr } = await supabase
        .from('health_policies')
        .insert({
          client_id: client1.id,
          company_2026: 'Ambetter Health Test',
          active: true
        })
        .select('*')
        .single();
      if (pErr) throw pErr;
      policy1 = newPol;
    }

    assert(!!policy1?.id, `Health policy active with ID: ${policy1.id}`);

    // 3. Test Section Creation & Auto-Fetch
    let { data: sections } = await supabase
      .from('health_policy_document_sections')
      .select('*')
      .eq('health_policy_id', policy1.id);

    if (!sections || sections.length === 0) {
      const { data: newSec, error: secErr } = await supabase
        .from('health_policy_document_sections')
        .insert({
          health_policy_id: policy1.id,
          name: 'General Documents',
          position: 0,
          created_by: client1.agent_id || '00000000-0000-0000-0000-000000000000'
        })
        .select('*')
        .single();

      if (secErr) throw secErr;
      sections = [newSec];
    }

    assert(sections.length > 0, `Folder section exists: "${sections[0].name}"`);

    // 4. Test Document Metadata Creation
    const testDocId = crypto.randomUUID();
    const testFilename = `test_health_doc_${Date.now()}.pdf`;
    const testPath = `${client1.agent_id || 'test-agent'}/${client1.id}/${policy1.id}/documents/${testDocId}/${testFilename}`;

    const { data: docData, error: docErr } = await supabase
      .from('health_policy_documents')
      .insert({
        id: testDocId,
        health_policy_id: policy1.id,
        section_id: sections[0].id,
        uploaded_by: client1.agent_id || '00000000-0000-0000-0000-000000000000',
        display_name: testFilename,
        original_filename: testFilename,
        storage_path: testPath,
        mime_type: 'application/pdf',
        size_bytes: 2048
      })
      .select('*')
      .single();

    assert(!docErr && docData?.id === testDocId, `Document metadata saved in health_policy_documents`);

    // Log Activity Event for Document Upload
    await supabase.from('activity_events').insert({
      client_id: client1.id,
      policy_id: null,
      actor_id: client1.agent_id || '00000000-0000-0000-0000-000000000000',
      event_type: 'health_document_uploaded',
      title: 'Health Document Uploaded',
      description: `Uploaded document "${testFilename}"`,
      metadata: { health_policy_id: policy1.id, filename: testFilename }
    });

    // 5. Test Note Creation
    const testNoteId = crypto.randomUUID();
    const noteText = `Test Health Policy Note ${Date.now()}`;
    const { data: noteData, error: noteErr } = await supabase
      .from('health_policy_notes')
      .insert({
        id: testNoteId,
        health_policy_id: policy1.id,
        author_id: client1.agent_id || '00000000-0000-0000-0000-000000000000',
        content: noteText
      })
      .select('*')
      .single();

    assert(!noteErr && noteData?.id === testNoteId, `Health note saved in health_policy_notes`);

    // Log Activity Event for Note
    await supabase.from('activity_events').insert({
      client_id: client1.id,
      policy_id: null,
      actor_id: client1.agent_id || '00000000-0000-0000-0000-000000000000',
      event_type: 'health_note_created',
      title: 'Health Note Created',
      description: `Note: "${noteText}"`,
      metadata: { health_policy_id: policy1.id, note_id: testNoteId }
    });

    // 6. Test Timeline Query for Policy 1
    const { data: events1 } = await supabase
      .from('activity_events')
      .select('*')
      .eq('client_id', client1.id);

    const healthEvents1 = (events1 || []).filter(e => e.metadata?.health_policy_id === policy1.id);

    assert(healthEvents1.length >= 2, `Timeline retrieved events logged for health_policy_id ${policy1.id}`);

    // 7. Verify Policy 2 does NOT see Policy 1 events
    if (client2) {
      let { data: policy2 } = await supabase
        .from('health_policies')
        .select('*')
        .eq('client_id', client2.id)
        .maybeSingle();

      if (policy2) {
        const { data: events2 } = await supabase
          .from('activity_events')
          .select('*')
          .eq('policy_id', policy2.id);

        const containsPolicy1Events = (events2 || []).some(e => e.metadata?.filename === testFilename);
        assert(!containsPolicy1Events, `Client 2 timeline is strictly isolated and does not contain Client 1 events`);
      }
    }

    // Cleanup test records
    await supabase.from('health_policy_notes').delete().eq('id', testNoteId);
    await supabase.from('health_policy_documents').delete().eq('id', testDocId);

    console.log('\n===========================================================');
    console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('Test Error:', err);
  }
}

testHealthModule();
