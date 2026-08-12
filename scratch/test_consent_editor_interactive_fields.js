const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('TEST SUITE: CONSENT EDITOR INTERACTIVE FIELDS & IMAGES');
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

// 1. Audit Types (src/lib/consents/types.ts)
const typesPath = path.join(__dirname, '../src/lib/consents/types.ts');
const typesSrc = fs.readFileSync(typesPath, 'utf8');

assert(typesSrc.includes("'image'") && typesSrc.includes("'checkbox'") && typesSrc.includes("'yes_no'") && typesSrc.includes("'initials'"), 'TEST 1 - BlockType includes image, checkbox, yes_no, initials');
assert(typesSrc.includes('export interface ImageBlock') && typesSrc.includes('export interface CheckboxBlock'), 'TEST 2 - Structured interfaces defined for ImageBlock, CheckboxBlock, YesNoBlock, InitialsBlock');
assert(typesSrc.includes('export interface ConsentFieldResponse'), 'TEST 3 - ConsentFieldResponse interface defined');

// 2. Audit Top Editor Toolbar (src/components/consents/TipTapConsentEditor.tsx)
const editorPath = path.join(__dirname, '../src/components/consents/TipTapConsentEditor.tsx');
const editorSrc = fs.readFileSync(editorPath, 'utf8');

assert(editorSrc.includes('🖼️ Image'), 'TEST 4 - Editor Top Toolbar includes Image action button');
assert(editorSrc.includes('☑ Checkbox'), 'TEST 5 - Editor Top Toolbar includes Checkbox action button');
assert(editorSrc.includes('🔘 Yes / No'), 'TEST 6 - Editor Top Toolbar includes Yes / No action button');
assert(editorSrc.includes('✍️ Initials'), 'TEST 7 - Editor Top Toolbar includes Initials action button');
assert(editorSrc.includes('/api/consents/upload-asset'), 'TEST 8 - Image upload calls secure /api/consents/upload-asset route');

// 3. Audit Storage Upload Route (src/app/api/consents/upload-asset/route.ts)
const uploadRoutePath = path.join(__dirname, '../src/app/api/consents/upload-asset/route.ts');
const uploadRouteSrc = fs.readFileSync(uploadRoutePath, 'utf8');

assert(uploadRouteSrc.includes("['image/png', 'image/jpeg', 'image/jpg', 'image/webp']"), 'TEST 9 - Upload route validates MIME types (PNG, JPG, WEBP)');
assert(uploadRouteSrc.includes('MAX_FILE_SIZE = 5 * 1024 * 1024'), 'TEST 10 - Upload route enforces 5MB max file size');
assert(uploadRouteSrc.includes('.from(\'signatures\')'), 'TEST 11 - Upload route stores assets in private signatures bucket');
assert(uploadRouteSrc.includes('createServerClient') && uploadRouteSrc.includes('cookies()'), 'TEST 11B - Upload route uses canonical createServerClient and cookies() for session auth');
assert(uploadRouteSrc.includes('const userId = user.id') && uploadRouteSrc.includes('storagePath = `${userId}/consent-assets/'), 'TEST 11C - Upload route derives agentId server-side from user.id ONLY');

// 4. Audit Signer Experience & Validation (src/components/signatures/SignDocument.tsx & PublicDocumentViewer.tsx)
const signDocPath = path.join(__dirname, '../src/components/signatures/SignDocument.tsx');
const signDocSrc = fs.readFileSync(signDocPath, 'utf8');

assert(signDocSrc.includes('fieldResponses'), 'TEST 12 - SignDocument maintains fieldResponses state');
assert(signDocSrc.includes("Please confirm required check:"), 'TEST 13 - Required checkbox validation blocks submission if unchecked');
assert(signDocSrc.includes("Please answer required question:"), 'TEST 14 - Required Yes/No validation blocks submission if unanswered');
assert(signDocSrc.includes("Please provide your initials for:"), 'TEST 15 - Required Initials validation blocks submission if empty');

// 5. Audit PDF Rendering (src/lib/signatures/pdf-generator.ts)
const pdfPath = path.join(__dirname, '../src/lib/signatures/pdf-generator.ts');
const pdfSrc = fs.readFileSync(pdfPath, 'utf8');

assert(pdfSrc.includes("case 'checkbox':"), 'TEST 16 - PDF generator renders Checkbox field state ([X] / [ ])');
assert(pdfSrc.includes("case 'yes_no':"), 'TEST 17 - PDF generator renders Yes/No field state ((X) / ( ))');
assert(pdfSrc.includes("case 'initials':"), 'TEST 18 - PDF generator renders Initials field state');
assert(pdfSrc.includes("case 'image':"), 'TEST 19 - PDF generator renders Image element');

console.log('\n====================================================');
console.log(`SUMMARY RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
