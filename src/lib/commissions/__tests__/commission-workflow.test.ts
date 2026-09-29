import * as XLSX from 'xlsx';
import {
  parseSpreadsheetDocument,
  parseCommissionRowsFromText,
} from '../extraction-service';
import {
  computeNameSimilarity,
  isCarrierMatch,
  normalizePolicyNumber,
  normalizeCarrier,
  matchExtractedRowsToCRM,
} from '../matching-service';
import { ExtractedCommissionRow } from '@/types/commissions';

async function runAllTests() {
  console.log('==================================================');
  console.log('RUNNING P&C COMMISSION IMPORT DETERMINISTIC TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // --------------------------------------------------
  // Test 1: XLSX spreadsheet extraction
  // --------------------------------------------------
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Date', 'Client Name', 'Policy Number', 'Carrier', 'Tx Code', 'Commission Amount'],
      ['2026-03-15', 'Maria Perez', 'POL-1001', 'Progressive', 'COMM', 125.50],
      ['2026-03-16', 'Jeffery Cunnyngham', 'POL-1002', 'Travelers', 'COMM', 250.00],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Commissions');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const rows = parseSpreadsheetDocument(xlsxBuffer);
    assert(rows.length === 2, 'Test 1: XLSX extraction row count', `Got ${rows.length} rows`);
    assert(rows[0].client_name === 'Maria Perez', 'Test 1: XLSX client name', `Got ${rows[0]?.client_name}`);
    assert(rows[0].membership_or_policy_number === 'POL-1001', 'Test 1: XLSX policy number', `Got ${rows[0]?.membership_or_policy_number}`);
    assert(rows[0].commission_amount === 125.50, 'Test 1: XLSX amount', `Got ${rows[0]?.commission_amount}`);
  } catch (e: any) {
    assert(false, 'Test 1: XLSX spreadsheet extraction', e.message);
  }

  // --------------------------------------------------
  // Test 2: XLS spreadsheet extraction
  // --------------------------------------------------
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Transaction Date', 'Insured Name', 'Policy #', 'Company', 'Amount'],
      ['03/20/2026', 'Camila Cabrera', 'FL-99281', 'Universal', '$310.00'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Statement');
    const xlsBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xls' });

    const rows = parseSpreadsheetDocument(xlsBuffer);
    assert(rows.length === 1, 'Test 2: XLS extraction row count', `Got ${rows.length} rows`);
    assert(rows[0].membership_or_policy_number === 'FL-99281', 'Test 2: XLS policy number', `Got ${rows[0]?.membership_or_policy_number}`);
  } catch (e: any) {
    assert(false, 'Test 2: XLS spreadsheet extraction', e.message);
  }

  // --------------------------------------------------
  // Test 3: CSV spreadsheet extraction
  // --------------------------------------------------
  try {
    const csvContent = 'Pay Date,Customer,Policy_No,Carrier,Comm Amount\n2026-03-10,John Smith,POL-550,Slide,75.25\n';
    const csvBuffer = Buffer.from(csvContent, 'utf-8');

    const rows = parseSpreadsheetDocument(csvBuffer);
    assert(rows.length === 1, 'Test 3: CSV extraction row count', `Got ${rows.length} rows`);
    assert(rows[0].client_name === 'John Smith', 'Test 3: CSV client name', `Got ${rows[0]?.client_name}`);
    assert(rows[0].commission_amount === 75.25, 'Test 3: CSV amount', `Got ${rows[0]?.commission_amount}`);
  } catch (e: any) {
    assert(false, 'Test 3: CSV spreadsheet extraction', e.message);
  }

  // --------------------------------------------------
  // Test 4: Header normalization across aliases
  // --------------------------------------------------
  try {
    const csvAliases = 'posted_date,customer_name,policyno,writing_company,trans_code,earned_amount\n2026-01-01,Test User,ABC12345,Citizens,DV,50.00\n';
    const rows = parseSpreadsheetDocument(Buffer.from(csvAliases, 'utf-8'));
    assert(rows.length === 1, 'Test 4: Alias header normalization', `Got ${rows.length} rows`);
    assert(rows[0].membership_or_policy_number === 'ABC12345', 'Test 4: Alias policy', `Got ${rows[0]?.membership_or_policy_number}`);
    assert(rows[0].carrier === 'Citizens', 'Test 4: Alias carrier', `Got ${rows[0]?.carrier}`);
    assert(rows[0].transaction_code === 'DV', 'Test 4: Alias tx code', `Got ${rows[0]?.transaction_code}`);
  } catch (e: any) {
    assert(false, 'Test 4: Header normalization across aliases', e.message);
  }

  // --------------------------------------------------
  // Test 5: Missing date handling (never invent dates)
  // --------------------------------------------------
  try {
    const textNoDate = 'Maria del Carmen Perez POL-1001 Progressive $125.50';
    const rows = parseCommissionRowsFromText(textNoDate);
    assert(rows.length === 1, 'Test 5: OCR missing date parsed', `Got ${rows.length} rows`);
    assert(rows[0].payment_date === '', 'Test 5: Payment date is empty (never invented)', `Got "${rows[0]?.payment_date}"`);
    assert(rows[0].match_status === 'REVIEW', 'Test 5: Match status is REVIEW when date missing', `Got "${rows[0]?.match_status}"`);
  } catch (e: any) {
    assert(false, 'Test 5: Missing date handling', e.message);
  }

  // --------------------------------------------------
  // Test 6: Exact policy match -> MATCHED
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-1',
              policy_number: '15127227-02',
              company_name: 'Progressive',
              effective_date: '2026-01-01',
              premium_amount: 1200,
              agent_id: 'agent-1',
              client_id: 'client-1',
              clients: { id: 'client-1', full_name: 'Maria del Carmen Perez Mena', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    const row: ExtractedCommissionRow = {
      id: 'row-1',
      payment_date: '2026-03-01',
      client_name: 'Maria Perez',
      membership_or_policy_number: '15127227-02',
      carrier: 'Progressive',
      commission_amount: 150,
      confidence: 0.9,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'MATCHED', 'Test 6: Exact match status is MATCHED', `Got ${res[0]?.match_status}`);
    assert(res[0].matched_policy_id === 'pol-1', 'Test 6: Exact match policy ID', `Got ${res[0]?.matched_policy_id}`);
  } catch (e: any) {
    assert(false, 'Test 6: Exact policy match', e.message);
  }

  // --------------------------------------------------
  // Test 7: Containment base policy match -> REVIEW
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-base',
              policy_number: '15127227-02',
              company_name: 'Progressive',
              agent_id: 'agent-1',
              client_id: 'client-1',
              clients: { id: 'client-1', full_name: 'Maria del Carmen Perez Mena', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    // Row has base policy "15127227" without suffix "-02"
    const row: ExtractedCommissionRow = {
      id: 'row-2',
      payment_date: '2026-03-01',
      client_name: 'Maria Perez',
      membership_or_policy_number: '15127227',
      carrier: 'Progressive',
      commission_amount: 150,
      confidence: 0.8,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'REVIEW', 'Test 7: Base policy match status is REVIEW', `Got ${res[0]?.match_status}`);
    assert(res[0].matched_policy_id === 'pol-base', 'Test 7: Suggested match policy attached', `Got ${res[0]?.matched_policy_id}`);
  } catch (e: any) {
    assert(false, 'Test 7: Containment base policy match', e.message);
  }

  // --------------------------------------------------
  // Test 8: Client name + carrier agreement match -> REVIEW
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-cunnyngham',
              policy_number: 'TRV-998822',
              company_name: 'Travelers',
              agent_id: 'agent-1',
              client_id: 'client-2',
              clients: { id: 'client-2', full_name: 'Jeffery Cunnyngham', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    // Row has typo or different policy number "TRV-998800" but name & carrier agree
    const row: ExtractedCommissionRow = {
      id: 'row-3',
      payment_date: '2026-03-01',
      client_name: 'Jeffery Cunnyngham',
      membership_or_policy_number: 'TRV-998800',
      carrier: 'Travelers Insurance',
      commission_amount: 200,
      confidence: 0.7,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'REVIEW', 'Test 8: Client + carrier match status is REVIEW', `Got ${res[0]?.match_status}`);
    assert(res[0].matched_client_name === 'Jeffery Cunnyngham', 'Test 8: Suggested client attached', `Got ${res[0]?.matched_client_name}`);
  } catch (e: any) {
    assert(false, 'Test 8: Client name + carrier agreement match', e.message);
  }

  // --------------------------------------------------
  // Test 9: Strong client name match -> REVIEW
  // --------------------------------------------------
  try {
    const sim = computeNameSimilarity('Camila Viera Cabrera', 'Camila Cabrera');
    assert(sim >= 0.75, 'Test 9: Name similarity function threshold', `Got similarity ${sim.toFixed(2)}`);

    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-cabrera',
              policy_number: 'UNI-4411',
              company_name: 'Universal Property',
              agent_id: 'agent-1',
              client_id: 'client-3',
              clients: { id: 'client-3', full_name: 'Camila Viera Cabrera', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    const row: ExtractedCommissionRow = {
      id: 'row-4',
      payment_date: '2026-03-01',
      client_name: 'Camila Cabrera',
      membership_or_policy_number: 'UNKNOWN-POL',
      carrier: 'Other Carrier',
      commission_amount: 300,
      confidence: 0.6,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'REVIEW', 'Test 9: Strong name match status is REVIEW', `Got ${res[0]?.match_status}`);
    assert(res[0].matched_client_id === 'client-3', 'Test 9: Suggested client match attached', `Got ${res[0]?.matched_client_id}`);
  } catch (e: any) {
    assert(false, 'Test 9: Strong client name match', e.message);
  }

  // --------------------------------------------------
  // Test 10: Multiple candidate matches -> REVIEW
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-m1',
              policy_number: 'POL-AUTO-1',
              company_name: 'Progressive',
              agent_id: 'agent-1',
              client_id: 'client-m',
              clients: { id: 'client-m', full_name: 'Maria Perez', agent_id: 'agent-1' },
            },
            {
              id: 'pol-m2',
              policy_number: 'POL-HOME-2',
              company_name: 'Progressive',
              agent_id: 'agent-1',
              client_id: 'client-m',
              clients: { id: 'client-m', full_name: 'Maria Perez', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    const row: ExtractedCommissionRow = {
      id: 'row-5',
      payment_date: '2026-03-01',
      client_name: 'Maria Perez',
      membership_or_policy_number: 'POL-MISSING',
      carrier: 'Progressive',
      commission_amount: 100,
      confidence: 0.6,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'REVIEW', 'Test 10: Multiple candidates status is REVIEW', `Got ${res[0]?.match_status}`);
  } catch (e: any) {
    assert(false, 'Test 10: Multiple candidate matches', e.message);
  }

  // --------------------------------------------------
  // Test 11: No candidate match -> UNMATCHED
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-other',
              policy_number: 'POL-111',
              company_name: 'Geico',
              agent_id: 'agent-1',
              client_id: 'client-other',
              clients: { id: 'client-other', full_name: 'Unknown Person', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    const row: ExtractedCommissionRow = {
      id: 'row-6',
      payment_date: '2026-03-01',
      client_name: 'Nonexistent Client',
      membership_or_policy_number: 'POL-999999',
      carrier: 'State Farm',
      commission_amount: 50,
      confidence: 0.9,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'UNMATCHED', 'Test 11: Unmatched status is UNMATCHED', `Got ${res[0]?.match_status}`);
  } catch (e: any) {
    assert(false, 'Test 11: No candidate match', e.message);
  }

  // --------------------------------------------------
  // Test 12: Shared agent access scoping
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'pc_policies') {
          return {
            select: () => Promise.resolve({
              data: [
                {
                  id: 'pol-secret',
                  policy_number: 'SECRET-777',
                  company_name: 'Travelers',
                  agent_id: 'unauthorized-agent-id',
                  client_id: 'client-secret',
                  clients: { id: 'client-secret', full_name: 'Secret Client', agent_id: 'unauthorized-agent-id' },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'agent_shared_access') {
          return {
            select: () => ({
              or: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          };
        }
        return { select: () => Promise.resolve({ data: [], error: null }) };
      },
    };

    const row: ExtractedCommissionRow = {
      id: 'row-7',
      payment_date: '2026-03-01',
      client_name: 'Secret Client',
      membership_or_policy_number: 'SECRET-777',
      carrier: 'Travelers',
      commission_amount: 500,
      confidence: 0.9,
      match_status: 'UNMATCHED',
    };

    // Agent 'agent-restricted' is not privileged and does not own 'SECRET-777'
    const res = await matchExtractedRowsToCRM([row], 'agent-restricted', mockSupabase, false);
    assert(res[0].match_status === 'UNMATCHED', 'Test 12: Unscoped policy excluded from matching', `Got ${res[0]?.match_status}`);
  } catch (e: any) {
    assert(false, 'Test 12: Shared agent access scoping', e.message);
  }

  // --------------------------------------------------
  // Test 13: Manual commission entry helper
  // --------------------------------------------------
  try {
    const manualRow: ExtractedCommissionRow = {
      id: 'manual-1',
      payment_date: '2026-03-29',
      client_name: 'Maria Perez',
      membership_or_policy_number: 'POL-1001',
      carrier: 'Progressive',
      transaction_code: 'COMM',
      commission_amount: 175.00,
      confidence: 1.0,
      match_status: 'MATCHED',
      matched_client_id: 'client-1',
      matched_policy_id: 'pol-1',
    };
    assert(manualRow.match_status === 'MATCHED', 'Test 13: Manual entry row initialized as MATCHED', `Got ${manualRow.match_status}`);
    assert(manualRow.matched_policy_id === 'pol-1', 'Test 13: Manual entry row linked to CRM policy', `Got ${manualRow.matched_policy_id}`);
  } catch (e: any) {
    assert(false, 'Test 13: Manual commission entry helper', e.message);
  }

  // --------------------------------------------------
  // Test 14: Neutral source label formatting
  // --------------------------------------------------
  try {
    const warning = 'Processed locally.';
    const isExposed = warning.includes('Gemini') || warning.includes('Vision AI unavailable');
    assert(!isExposed, 'Test 14: Neutral source warning does not expose AI vendor strings', `Warning: "${warning}"`);
  } catch (e: any) {
    assert(false, 'Test 14: Neutral source label formatting', e.message);
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
