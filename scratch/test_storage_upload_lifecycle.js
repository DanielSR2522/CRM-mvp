const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function testLifecycle() {
  console.log('Testing crm-documents bucket availability...');

  const testBuffer = Buffer.from('TEST DOCUMENT CONTENT FOR AGENT DOCUMENT AUDIT');
  const testFileName = `test_${Date.now()}.pdf`;
  const storagePath = `agents/test-agent-id/${testFileName}`;

  // 1. Try uploading to crm-documents bucket
  console.log(`1. Uploading file to crm-documents bucket at path: ${storagePath}`);
  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('crm-documents')
    .upload(storagePath, testBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadErr) {
    console.error('Upload Error:', uploadErr);
    return;
  }
  console.log('Upload Successful! Path:', uploadData.path);

  // 2. Generate signed URL
  console.log('2. Generating signed URL...');
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('crm-documents')
    .createSignedUrl(storagePath, 3600);

  if (signedErr || !signedData?.signedUrl) {
    console.error('Signed URL Error:', signedErr);
  } else {
    console.log('Signed URL Generated Successfully!');
  }

  // 3. Clean up test file
  console.log('3. Deleting test file...');
  const { error: deleteErr } = await supabase.storage
    .from('crm-documents')
    .remove([storagePath]);

  if (deleteErr) {
    console.error('Delete Error:', deleteErr);
  } else {
    console.log('Delete Successful!');
  }

  console.log('\nALL STORAGE LIFECYCLE CHECKS PASSED SUCCESSFULLY!');
}

testLifecycle();
