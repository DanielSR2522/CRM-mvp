import fs from 'fs';
import path from 'path';
import { extractCommissionDocument } from '../extraction-service';
import { GeminiVisionProvider } from '../providers/gemini-vision-provider';
import { matchExtractedRowsToCRM } from '../matching-service';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

async function runRealImageComparison() {
  console.log('==================================================');
  console.log('REAL IMAGE EXTRACTION COMPARISON: GEMINI vs LOCAL OCR');
  console.log('==================================================\n');

  const imagePath1 = 'C:\\Users\\SEBASTIAN\\.gemini\\antigravity\\brain\\d1c12bbc-a176-4284-85a2-fb9e42d6fb27\\.user_uploaded\\media_1790212851511.png';
  const imagePath2 = 'C:\\Users\\SEBASTIAN\\.gemini\\antigravity\\brain\\d1c12bbc-a176-4284-85a2-fb9e42d6fb27\\.user_uploaded\\media_1790212823308.png';

  const hasImage1 = fs.existsSync(imagePath1);
  const hasImage2 = fs.existsSync(imagePath2);

  if (!hasImage1 && !hasImage2) {
    console.log('[Notice] No local test screenshots found in .user_uploaded folder.');
    return;
  }

  const targetPath = hasImage1 ? imagePath1 : imagePath2;
  const imageBuffer = fs.readFileSync(targetPath);
  console.log(`Loaded test image (${imageBuffer.length} bytes): ${path.basename(targetPath)}`);

  // A. Run with Gemini (if GEMINI_API_KEY available)
  console.log('\n--- A. Gemini 2.5 Flash-Lite Extraction ---');
  let geminiResult;
  try {
    const provider = new GeminiVisionProvider();
    if (provider.isAvailable()) {
      geminiResult = await provider.extract(imageBuffer, 'image/png', 'decire_statement.png');
      console.log(`Gemini Extracted Rows (${geminiResult.rows.length}):`);
      geminiResult.rows.forEach((r, idx) => {
        console.log(`  Row ${idx + 1}: Client: "${r.client_name}" | Policy: "${r.membership_or_policy_number}" | Carrier: "${r.carrier}" | Date: "${r.payment_date}" | Amt: $${r.commission_amount}`);
      });
    } else {
      console.log('GEMINI_API_KEY not present in environment. Gemini extraction skipped in offline comparison.');
    }
  } catch (err: any) {
    console.warn('Gemini extraction notice:', err.message);
  }

  // B. Run Local OCR Fallback
  console.log('\n--- B. Local OCR Extraction (Sharp + Tesseract) ---');
  // Temporarily disable GEMINI_API_KEY to test local OCR
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  let ocrResult;
  try {
    ocrResult = await extractCommissionDocument(imageBuffer, 'image/png', 'decire_statement.png');
    console.log(`Local OCR Extracted Rows (${ocrResult.rows.length}):`);
    ocrResult.rows.forEach((r, idx) => {
      console.log(`  Row ${idx + 1}: Client: "${r.client_name}" | Policy: "${r.membership_or_policy_number}" | Carrier: "${r.carrier}" | Date: "${r.payment_date}" | Amt: $${r.commission_amount}`);
    });
  } catch (err: any) {
    console.error('Local OCR extraction error:', err.message);
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }

  // C. Test Read-only CRM Matching on Extracted Rows (No DB Mutation)
  console.log('\n--- C. Deterministic CRM Matching Test (Read-Only) ---');
  const rowsToMatch = geminiResult?.rows || ocrResult?.rows || [];
  if (rowsToMatch.length > 0) {
    try {
      const admin = getSupabaseAdmin();
      const matched = await matchExtractedRowsToCRM(rowsToMatch, 'admin-agent-id', admin, true);
      matched.forEach((r, idx) => {
        console.log(`  Row ${idx + 1} (${r.client_name}): Status = ${r.match_status} | Reason: ${r.confidence_reason || 'Matched'}`);
        if (r.matched_policy_id) {
          console.log(`     -> Matched Policy ID: ${r.matched_policy_id} (${r.matched_client_name} - ${r.matched_policy_number})`);
        }
      });
    } catch (e: any) {
      console.warn('CRM matching test notice:', e.message);
    }
  }

  console.log('\n==================================================');
  console.log('REAL IMAGE EXTRACTION COMPARISON COMPLETE');
  console.log('==================================================');
}

runRealImageComparison();
