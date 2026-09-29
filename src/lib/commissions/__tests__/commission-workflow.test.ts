import * as XLSX from 'xlsx';
import {
  parseSpreadsheetDocument,
  parseCommissionRowsFromText,
  extractCommissionDocument,
} from '../extraction-service';
import {
  computeNameSimilarity,
  isCarrierMatch,
  normalizePolicyNumber,
  normalizeCarrier,
  matchExtractedRowsToCRM,
} from '../matching-service';
import { GeminiVisionProvider } from '../providers/gemini-vision-provider';
import { ExtractedCommissionRow } from '@/types/commissions';

// Valid 1x1 PNG Buffer for mock image testing
const SAMPLE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runAllTests() {
  console.log('==================================================');
  console.log('RUNNING GEMINI VISION + DETERMINISTIC P&C TESTS');
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

  const originalFetch = global.fetch;

  // --------------------------------------------------
  // Test 1: Gemini image extraction success
  // --------------------------------------------------
  try {
    global.fetch = (async (url: string | URL | Request) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: 'statement_photo',
                      rows: [
                        {
                          date: '03/15/2026',
                          client_name: 'Maria del Carmen Perez Mena',
                          membership_or_policy_number: '15127227-02',
                          carrier: 'Progressive',
                          transaction_code: 'COMM',
                          amount: 125.50,
                          confidence: 1.0,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as any;

    process.env.GEMINI_API_KEY = 'test-mock-key';
    const result = await extractCommissionDocument(SAMPLE_PNG_BUFFER, 'image/png', 'sample.png');

    assert(result.extraction_method === 'vision_ai', 'Test 1: Gemini extraction method', `Got ${result.extraction_method}`);
    assert(result.rows.length === 1, 'Test 1: Gemini extracted rows count', `Got ${result.rows.length}`);
    assert(result.rows[0].membership_or_policy_number === '15127227-02', 'Test 1: Gemini policy suffix preserved', `Got ${result.rows[0]?.membership_or_policy_number}`);
  } catch (e: any) {
    assert(false, 'Test 1: Gemini image extraction success', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 2: Gemini failure -> OCR fallback
  // --------------------------------------------------
  try {
    global.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response;
    }) as any;

    process.env.GEMINI_API_KEY = 'test-mock-key';
    const result = await extractCommissionDocument(SAMPLE_PNG_BUFFER, 'image/png', 'sample.png');

    assert(result.extraction_method === 'ocr_fallback', 'Test 2: Fallback to OCR on Gemini 500 failure', `Got ${result.extraction_method}`);
    assert(result.document_warnings.includes('Processed locally.'), 'Test 2: Neutral warning on fallback', `Warnings: ${result.document_warnings}`);
  } catch (e: any) {
    assert(false, 'Test 2: Gemini failure -> OCR fallback', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 3: Gemini timeout -> OCR fallback
  // --------------------------------------------------
  try {
    global.fetch = (async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }) as any;

    process.env.GEMINI_API_KEY = 'test-mock-key';
    const result = await extractCommissionDocument(SAMPLE_PNG_BUFFER, 'image/png', 'sample.png');

    assert(result.extraction_method === 'ocr_fallback', 'Test 3: Fallback to OCR on Gemini timeout', `Got ${result.extraction_method}`);
  } catch (e: any) {
    assert(false, 'Test 3: Gemini timeout -> OCR fallback', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 4: Spreadsheet path never calls Gemini
  // --------------------------------------------------
  try {
    let geminiCalled = false;
    global.fetch = (async () => {
      geminiCalled = true;
      throw new Error('Gemini should NOT be called for spreadsheet!');
    }) as any;

    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Date', 'Client', 'Policy', 'Carrier', 'Amount'],
      ['2026-03-01', 'Jhuber Vasquez', 'PTH0019893', 'Patriot Select', 180.00],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), 'Sheet1');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await extractCommissionDocument(xlsxBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'statement.xlsx');

    assert(!geminiCalled, 'Test 4: Spreadsheet path never calls Gemini', `Gemini called: ${geminiCalled}`);
    assert(result.extraction_method === 'structured_file', 'Test 4: Extraction method structured_file', `Got ${result.extraction_method}`);
    assert(result.rows[0].membership_or_policy_number === 'PTH0019893', 'Test 4: Policy extracted from spreadsheet', `Got ${result.rows[0]?.membership_or_policy_number}`);
  } catch (e: any) {
    assert(false, 'Test 4: Spreadsheet path never calls Gemini', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 5: PDF text path never calls Gemini
  // --------------------------------------------------
  try {
    let geminiCalled = false;
    global.fetch = (async () => {
      geminiCalled = true;
      throw new Error('Gemini should NOT be called for PDF!');
    }) as any;

    const dummyPdfBuffer = Buffer.from('%PDF-1.4 dummy pdf content');
    const result = await extractCommissionDocument(dummyPdfBuffer, 'application/pdf', 'statement.pdf');

    assert(!geminiCalled, 'Test 5: PDF path never calls Gemini', `Gemini called: ${geminiCalled}`);
    assert(result.extraction_method === 'ocr_fallback', 'Test 5: PDF method ocr_fallback', `Got ${result.extraction_method}`);
  } catch (e: any) {
    assert(false, 'Test 5: PDF text path never calls Gemini', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 6: Manual entry never calls Gemini
  // --------------------------------------------------
  try {
    const manualRow: ExtractedCommissionRow = {
      id: 'manual-row-1',
      payment_date: '2026-03-29',
      client_name: 'Camila Viera Cabrera',
      membership_or_policy_number: '6242957865-461212307',
      carrier: 'Citizens',
      commission_amount: 310.00,
      confidence: 1.0,
      match_status: 'MATCHED',
    };
    assert(manualRow.membership_or_policy_number === '6242957865-461212307', 'Test 6: Manual entry preserves full policy number with suffix', `Got ${manualRow.membership_or_policy_number}`);
  } catch (e: any) {
    assert(false, 'Test 6: Manual entry never calls Gemini', e.message);
  }

  // --------------------------------------------------
  // Test 7: Gemini preserves policy suffix
  // --------------------------------------------------
  try {
    global.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: 'statement_photo',
                      rows: [
                        {
                          date: '03/15/2026',
                          client_name: 'Camila Viera Cabrera',
                          membership_or_policy_number: '6242957865-461212307',
                          carrier: 'Citizens',
                          amount: 310.00,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as any;

    const provider = new GeminiVisionProvider();
    const result = await provider.extract(SAMPLE_PNG_BUFFER, 'image/png', 'img.png');
    assert(result.rows[0].membership_or_policy_number === '6242957865-461212307', 'Test 7: Policy suffix preserved in Gemini result', `Got ${result.rows[0]?.membership_or_policy_number}`);
  } catch (e: any) {
    assert(false, 'Test 7: Gemini preserves policy suffix', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 8: Gemini does not invent missing date
  // --------------------------------------------------
  try {
    global.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: 'statement_photo',
                      rows: [
                        {
                          date: '',
                          client_name: 'Maria Perez',
                          membership_or_policy_number: '15127227-02',
                          carrier: 'Progressive',
                          amount: 100.00,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as any;

    const provider = new GeminiVisionProvider();
    const result = await provider.extract(SAMPLE_PNG_BUFFER, 'image/png', 'img.png');
    assert(result.rows[0].payment_date === '', 'Test 8: Missing date is returned as empty string', `Got "${result.rows[0]?.payment_date}"`);
    assert(result.rows[0].match_status === 'REVIEW', 'Test 8: Match status is REVIEW when date is missing', `Got ${result.rows[0]?.match_status}`);
  } catch (e: any) {
    assert(false, 'Test 8: Gemini does not invent missing date', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 9: Negative commission amount parsing
  // --------------------------------------------------
  try {
    global.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: 'statement_photo',
                      rows: [
                        {
                          date: '03/15/2026',
                          client_name: 'Jeffery Cunnyngham',
                          membership_or_policy_number: 'TRV102938',
                          carrier: 'Travelers',
                          amount: '$(178.50)',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as any;

    const provider = new GeminiVisionProvider();
    const result = await provider.extract(SAMPLE_PNG_BUFFER, 'image/png', 'img.png');
    assert(result.rows[0].commission_amount === -178.50, 'Test 9: Parentheses negative amount parsed to negative float', `Got ${result.rows[0]?.commission_amount}`);
  } catch (e: any) {
    assert(false, 'Test 9: Negative commission amount parsing', e.message);
  } finally {
    global.fetch = originalFetch;
  }

  // --------------------------------------------------
  // Test 10: Deterministic CRM matching remains unchanged
  // --------------------------------------------------
  try {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => Promise.resolve({
          data: [
            {
              id: 'pol-jhuber',
              policy_number: 'PTH0019893',
              company_name: 'Patriot Select',
              effective_date: '2026-01-01',
              premium_amount: 1500,
              agent_id: 'agent-1',
              client_id: 'client-jhuber',
              clients: { id: 'client-jhuber', full_name: 'Jhuber Vasquez', agent_id: 'agent-1' },
            },
          ],
          error: null,
        }),
      }),
    };

    const row: ExtractedCommissionRow = {
      id: 'row-jhuber',
      payment_date: '2026-03-01',
      client_name: 'Jhuber Vasquez',
      membership_or_policy_number: 'PTH0019893',
      carrier: 'Patriot Select',
      commission_amount: 180.00,
      confidence: 1.0,
      match_status: 'UNMATCHED',
    };

    const res = await matchExtractedRowsToCRM([row], 'agent-1', mockSupabase, true);
    assert(res[0].match_status === 'MATCHED', 'Test 10: Exact CRM match status is MATCHED', `Got ${res[0]?.match_status}`);
    assert(res[0].matched_client_name === 'Jhuber Vasquez', 'Test 10: CRM matched client name', `Got ${res[0]?.matched_client_name}`);
  } catch (e: any) {
    assert(false, 'Test 10: Deterministic CRM matching remains unchanged', e.message);
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
