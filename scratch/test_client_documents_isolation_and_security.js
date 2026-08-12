const fs = require('fs');

const migrationText = fs.readFileSync('supabase/migrations/20260810000001_create_client_documents.sql', 'utf8');

console.log('====================================================');
console.log('STATIC & POLICY AUDIT: CLIENT DOCUMENTS SECURITY');
console.log('====================================================\n');

// 1. Verify NO can_access_agent in migration
const hasCanAccess = migrationText.includes('can_access_agent');
console.log(`1. Migration includes can_access_agent(): ${hasCanAccess ? '❌ FAIL (INSECURE)' : '✅ PASS (STRICTLY OWNER-PRIVATE)'}`);

// 2. Verify all RLS policies are owner-only
const ownerChecks = [...migrationText.matchAll(/c\.agent_id = auth\.uid\(\)/g)];
console.log(`2. Owner-only agent_id checks count: ${ownerChecks.length}`);

// 3. Check bucket reuse
const clientPageText = fs.readFileSync('src/app/clients/[id]/page.tsx', 'utf8');
const usesPolicyDocumentsBucket = clientPageText.includes(".from('policy-documents')");
console.log(`3. Reuses existing policy-documents bucket: ${usesPolicyDocumentsBucket ? '✅ YES' : '❌ NO'}`);

// 4. Check storage path format
const usesNamespacedPath = clientPageText.includes('${user.id}/clients/${clientId}/');
console.log(`4. Uses namespaced storage path \${user.id}/clients/\${clientId}/: ${usesNamespacedPath ? '✅ YES' : '❌ NO'}`);

// 5. Check 20MB limit in FileDropzone
const dropzoneText = fs.readFileSync('src/components/ui/FileDropzone.tsx', 'utf8');
const has20MBDefault = dropzoneText.includes('20 * 1024 * 1024');
const hasDynamicText = dropzoneText.includes('Math.round(maxSizeBytes / (1024 * 1024))');
console.log(`5. FileDropzone 20MB default & dynamic label: ${has20MBDefault && hasDynamicText ? '✅ YES' : '❌ NO'}`);

console.log('\n====================================================');
console.log('CLIENT DOCUMENTS SECURITY AUDIT COMPLETE');
console.log('====================================================');
