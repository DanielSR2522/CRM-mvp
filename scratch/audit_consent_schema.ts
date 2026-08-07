import { createClient } from '@supabase/supabase-js';
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function auditConsentDatabase() {
  console.log('===========================================================');
  console.log('AUDITING CONSENT SYSTEM DATABASE TABLES & COLUMNS');
  console.log('===========================================================\n');

  // 1. Consent Templates
  const { data: templates, error: tErr } = await supabase.from('consent_templates').select('*').limit(3);
  console.log('1. consent_templates columns:');
  if (tErr) console.error('   Err:', tErr.message);
  else console.log('  ', templates && templates.length > 0 ? Object.keys(templates[0]) : '(empty table)');

  // 2. Consent Template Versions
  const { data: versions, error: vErr } = await supabase.from('consent_template_versions').select('*').limit(3);
  console.log('\n2. consent_template_versions columns:');
  if (vErr) console.error('   Err:', vErr.message);
  else console.log('  ', versions && versions.length > 0 ? Object.keys(versions[0]) : '(empty table)');

  if (versions && versions.length > 0) {
    console.log('\n   Sample version record:');
    console.log('   version_number:', versions[0].version_number);
    console.log('   content type:', typeof versions[0].content);
    console.log('   content sample:', JSON.stringify(versions[0].content).slice(0, 300));
    console.log('   consent_text:', versions[0].consent_text);
    console.log('   variables_used:', versions[0].variables_used);
  }

  // 3. Signature Requests
  const { data: requests, error: rErr } = await supabase.from('signature_requests').select('*').limit(1);
  console.log('\n3. signature_requests columns:');
  if (rErr) console.error('   Err:', rErr.message);
  else console.log('  ', requests && requests.length > 0 ? Object.keys(requests[0]) : '(empty table)');

  // 4. Signature Files
  const { data: files, error: fErr } = await supabase.from('signature_files').select('*').limit(1);
  console.log('\n4. signature_files columns:');
  if (fErr) console.error('   Err:', fErr.message);
  else console.log('  ', files && files.length > 0 ? Object.keys(files[0]) : '(empty table)');

  // 5. Signature Events
  const { data: events, error: eErr } = await supabase.from('signature_events').select('*').limit(1);
  console.log('\n5. signature_events columns:');
  if (eErr) console.error('   Err:', eErr.message);
  else console.log('  ', events && events.length > 0 ? Object.keys(events[0]) : '(empty table)');

  // 6. Check Storage Buckets
  const { data: buckets } = await supabase.storage.listBuckets();
  console.log('\n6. Storage Buckets:');
  console.log('  ', buckets ? buckets.map(b => b.name) : []);
}

auditConsentDatabase();
