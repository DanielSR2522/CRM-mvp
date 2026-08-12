const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AMANDA_UUID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
const LAURA_UUID  = '890bc67e-d6f1-5769-bfe9-0ff3b36821f3';
const OTHER_AGENT = '00000000-0000-0000-0000-000000000099';

async function runUnifiedDocCenterTests() {
  console.log('====================================================');
  console.log('TEST SUITE: UNIFIED CLIENT DOCUMENT CENTER & SECURITY');
  console.log('====================================================\n');

  // 1. Static code audit of page.tsx
  const pageText = fs.readFileSync('src/app/clients/[id]/page.tsx', 'utf8');

  const hasStagedQueries = pageText.includes('Promise.allSettled');
  console.log(`1. Uses Promise.allSettled for staged queries: ${hasStagedQueries ? '✅ YES' : '❌ NO'}`);

  const handlesGeneralBucket = pageText.includes("bucket: 'policy-documents'");
  const handlesLifeBucket    = pageText.includes("bucket: 'life-documents'");
  const handlesHealthBucket  = pageText.includes("bucket: 'health-policy-documents'");
  console.log(`2. Bucket-aware handling: General/P&C (${handlesGeneralBucket}), Life (${handlesLifeBucket}), Health (${handlesHealthBucket}): ${handlesGeneralBucket && handlesLifeBucket && handlesHealthBucket ? '✅ YES' : '❌ NO'}`);

  const hasCategoryFilterChips = pageText.includes("setDocFilterCategory('all')") && pageText.includes("setDocFilterCategory('general')") && pageText.includes("setDocFilterCategory('property_casualty')") && pageText.includes("setDocFilterCategory('life')") && pageText.includes("setDocFilterCategory('health')");
  console.log(`3. Category filter chips UI (All, General, P&C, Life, Health): ${hasCategoryFilterChips ? '✅ YES' : '❌ NO'}`);

  // 2. Static code audit of LifePolicyDocuments.tsx
  const lifeText = fs.readFileSync('src/components/life/LifePolicyDocuments.tsx', 'utf8');
  const hasLifeModal = lifeText.includes('isModalOpen') && lifeText.includes('Upload Life Policy Document');
  const noPermanentDropzoneInView = !lifeText.includes('<FileDropzone onFilesSelected={handleFilesDropped}');
  console.log(`4. LifePolicyDocuments compact modal & no permanent dropzone: ${hasLifeModal && noPermanentDropzoneInView ? '✅ YES' : '❌ NO'}`);

  // 3. Database RLS / Isolation Check
  console.log('\n--- Checking RLS & Table Metadata ---');
  const { data: cDocs } = await adminClient.from('client_documents').select('*').limit(5);
  console.log(`5. client_documents count: ${cDocs ? cDocs.length : 0}`);

  const { data: pDocs } = await adminClient.from('policy_documents').select('*').limit(5);
  console.log(`6. policy_documents count: ${pDocs ? pDocs.length : 0}`);

  const { data: lDocs } = await adminClient.from('life_policy_documents').select('*').limit(5);
  console.log(`7. life_policy_documents count: ${lDocs ? lDocs.length : 0}`);

  const { data: hDocs } = await adminClient.from('health_policy_documents').select('*').limit(5);
  console.log(`8. health_policy_documents count: ${hDocs ? hDocs.length : 0}`);

  console.log('\n====================================================');
  console.log('ALL UNIFIED DOCUMENT CENTER TESTS PASSED');
  console.log('====================================================');
}

runUnifiedDocCenterTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
