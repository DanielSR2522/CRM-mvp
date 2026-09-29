import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { matchExtractedRowsToCRM } from '../matching-service';
import { ExtractedCommissionRow } from '@/types/commissions';

async function verifyProductionExamples() {
  console.log('==================================================');
  console.log('READ-ONLY DB MATCHING VERIFICATION');
  console.log('==================================================\n');

  try {
    const admin = getSupabaseAdmin();

    const sampleRows: ExtractedCommissionRow[] = [
      {
        id: 'verify-1',
        payment_date: '2026-03-01',
        client_name: 'Maria del Carmen Perez Mena',
        membership_or_policy_number: '15127227-02',
        carrier: 'Progressive',
        commission_amount: 150.00,
        confidence: 0.95,
        match_status: 'UNMATCHED',
      },
      {
        id: 'verify-2',
        payment_date: '2026-03-01',
        client_name: 'Jeffery Cunnyngham',
        membership_or_policy_number: 'TRV102938',
        carrier: 'Travelers',
        commission_amount: 220.00,
        confidence: 0.90,
        match_status: 'UNMATCHED',
      },
      {
        id: 'verify-3',
        payment_date: '2026-03-01',
        client_name: 'Camila Viera Cabrera',
        membership_or_policy_number: 'UNI889922',
        carrier: 'Universal',
        commission_amount: 180.00,
        confidence: 0.90,
        match_status: 'UNMATCHED',
      },
    ];

    console.log('Executing read-only matchExtractedRowsToCRM with admin privilege...');
    const results = await matchExtractedRowsToCRM(sampleRows, 'admin-agent-id', admin, true);

    results.forEach((r, i) => {
      console.log(`\nRow ${i + 1} (${r.client_name} - ${r.membership_or_policy_number}):`);
      console.log(`  Match Status: ${r.match_status}`);
      console.log(`  Reason: ${r.confidence_reason || 'N/A'}`);
      if (r.matched_policy_id) {
        console.log(`  Matched Policy ID: ${r.matched_policy_id}`);
        console.log(`  Matched Client Name: ${r.matched_client_name}`);
        console.log(`  Matched Policy #: ${r.matched_policy_number}`);
      }
    });

    console.log('\n==================================================');
    console.log('READ-ONLY DB MATCHING VERIFICATION COMPLETE');
    console.log('==================================================');
  } catch (err: any) {
    console.error('[DB Verification Error]:', err.message);
  }
}

verifyProductionExamples();
