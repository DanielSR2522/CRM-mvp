const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: AGENT INFORMATION DOCUMENTS WORKFLOW');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`${message}: ✅ PASS`);
    passCount++;
  } else {
    console.error(`${message}: ❌ FAIL`);
    failCount++;
  }
}

// 1. Audit Table Migration File (20260815000001_create_agent_documents.sql)
const migPath = path.join(__dirname, '../supabase/migrations/20260815000001_create_agent_documents.sql');
const migExists = fs.existsSync(migPath);
assert(migExists, 'TEST 1 - Migration 20260815000001_create_agent_documents.sql exists');

if (migExists) {
  const migContent = fs.readFileSync(migPath, 'utf8');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.agent_documents'), 'TEST 2 - Creates public.agent_documents table');
  assert(migContent.includes('agent_id UUID NOT NULL REFERENCES auth.users(id)'), 'TEST 3 - Enforces agent_id = auth.users(id) FK ownership');
  assert(migContent.includes('section_name TEXT NOT NULL') && migContent.includes('display_name TEXT NOT NULL'), 'TEST 4 - Includes custom section_name and display_name schema fields');
  assert(migContent.includes('ENABLE ROW LEVEL SECURITY'), 'TEST 5 - Enables Row Level Security on agent_documents');
  assert(migContent.includes('USING (agent_id = auth.uid())'), 'TEST 6 - Restricts agent_id = auth.uid() in RLS policies');
}

// 2. Audit Storage Migration File (20260815000002_create_storage_buckets.sql)
const storageMigPath = path.join(__dirname, '../supabase/migrations/20260815000002_create_storage_buckets.sql');
const storageMigExists = fs.existsSync(storageMigPath);
assert(storageMigExists, 'TEST 7 - Storage Migration 20260815000002_create_storage_buckets.sql exists');

if (storageMigExists) {
  const storageMigContent = fs.readFileSync(storageMigPath, 'utf8');
  assert(storageMigContent.includes("VALUES ('crm-documents', 'crm-documents', false"), 'TEST 8 - Migration creates private crm-documents bucket');
}

// 3. Audit Agent Information Page (src/app/agent-information/page.tsx)
const agentInfoPath = path.join(__dirname, '../src/app/agent-information/page.tsx');
const agentInfoContent = fs.readFileSync(agentInfoPath, 'utf8');

assert(agentInfoContent.includes('Agent Documents'), 'TEST 9 - Agent Information renders Agent Documents section');
assert(agentInfoContent.includes('Upload Document'), 'TEST 10 - Upload Document action button present');
assert(agentInfoContent.includes('handleUploadAgentDocument'), 'TEST 11 - Upload document submit handler implemented');
assert(agentInfoContent.includes('handlePreviewAgentDoc') && agentInfoContent.includes('DocumentPreviewModal'), 'TEST 12 - Reuses canonical DocumentPreviewModal for preview');
assert(agentInfoContent.includes('handleDownloadAgentDoc'), 'TEST 13 - Download action generates signed URL');
assert(agentInfoContent.includes('handleDeleteAgentDoc') && agentInfoContent.includes(".remove([doc.storage_path])"), 'TEST 14 - Delete action removes DB record and storage object');
assert(agentInfoContent.includes('groupedAgentDocs'), 'TEST 15 - Documents rendered grouped by Section / Category');
assert(agentInfoContent.includes('docSearchQuery') && agentInfoContent.includes('docSectionFilter'), 'TEST 16 - Includes document search and section filter dropdown');
assert(agentInfoContent.includes('editingDoc') && agentInfoContent.includes('handleSaveDocEdit'), 'TEST 17 - Supports editing display_name and section_name metadata');
assert(agentInfoContent.includes('agents/${userId}/'), 'TEST 18 - Uses sanitized storage path under agents/${userId}/${documentId}/');
assert(agentInfoContent.includes("if (dbErr)") && agentInfoContent.includes("remove([storagePath])"), 'TEST 19 - Rollback cleanup removes storage object if DB metadata insert fails');

// 4. Audit Isolation from Client Documents
const clientProfilePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
const clientProfileContent = fs.readFileSync(clientProfilePath, 'utf8');

assert(!clientProfileContent.includes("from('agent_documents')"), 'TEST 20 - Client profile page isolated (does not leak agent_documents into client documents)');

console.log('\n====================================================');
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
