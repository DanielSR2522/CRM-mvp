import { IVisionExtractionProvider } from './vision-provider-interface';
import { StructuredExtractionResult, ExtractedCommissionRow, MatchStatus } from '@/types/commissions';

type DocumentType = 'structured_table' | 'whatsapp_chat' | 'statement_photo' | 'pdf_document' | 'unknown';

interface GeminiParsedRow {
  date?: string;
  client_name?: string;
  membership_or_policy_number?: string;
  carrier?: string;
  transaction_code?: string;
  amount?: number | string;
  confidence?: number;
  confidence_reason?: string;
  warnings?: string[];
}

interface GeminiParsedResponse {
  document_type?: string;
  document_warnings?: string[];
  rows?: GeminiParsedRow[];
}

export class GeminiVisionProvider implements IVisionExtractionProvider {
  name = 'Gemini 2.5 Flash-Lite';

  isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  async extract(fileBuffer: Buffer, mimeType: string, filename: string): Promise<StructuredExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }

    const base64Data = fileBuffer.toString('base64');
    const effectiveMimeType = mimeType.startsWith('image/')
      ? mimeType
      : 'image/png';

    const promptText = `
You are an expert P&C Insurance Commission Document AI extractor.
Analyze the attached commission screenshot/image and extract ALL visible commission rows.

CRITICAL EXTRACTION RULES:
1. Extract ONLY fields that are visibly present in the image.
2. For each visible row extract:
   - date: payment or statement date in MM/DD/YYYY or YYYY-MM-DD format as written. If date cannot be read, set to empty string "". DO NOT invent or guess dates.
   - client_name: full client/insured name as visibly written.
   - membership_or_policy_number: policy or member ID exactly as written, preserving all suffixes such as "-02" (e.g. "15127227-02", "6242957865-461212307", "PTH0019893"). If missing/unreadable, set to empty string "". NEVER invent policy numbers.
   - carrier: exact insurance company/carrier name as visibly shown (e.g. "Slide", "Progressive", "Travelers", "Citizens", "Geico", "Patriot Select", etc.).
   - transaction_code: transaction code if visibly shown (e.g. "COMM", "DV", "LA", "BOP"). If none, set to "".
   - amount: commission dollar amount. Preserve negative amounts shown with parentheses or minus signs (e.g. "$45.55" -> 45.55, "$(178.50)" or "($178.50)" -> -178.50, "-50.00" -> -50.00).
   - confidence: float between 0.0 and 1.0 reflecting extraction certainty. Use 1.0 for clearly readable complete rows. Use 0.4 - 0.6 if policy number or date is missing/unreadable.
   - confidence_reason: string explanation if confidence < 0.8.
3. Determine document_type: one of "structured_table", "whatsapp_chat", "statement_photo", "unknown".
4. NEVER invent fictitious client names, policy numbers, or dates.
5. Return ONLY a valid JSON object matching this exact schema:

{
  "document_type": "statement_photo",
  "rows": [
    {
      "date": "07/30/2026",
      "client_name": "Maria del Carmen Perez Mena",
      "membership_or_policy_number": "15127227-02",
      "carrier": "Progressive",
      "transaction_code": "COMM",
      "amount": 125.50,
      "confidence": 1.0,
      "confidence_reason": "",
      "warnings": []
    }
  ],
  "document_warnings": []
}
`;

    // Model configured specifically with gemini-2.5-flash-lite primary and active flash fallbacks
    const modelsToTry = ['gemini-2.5-flash-lite', 'gemini-1.5-flash-002', 'gemini-1.5-flash-001', 'gemini-2.0-flash'];

    let lastErrorText = '';
    let lastStatus = 500;

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      console.log(`[Gemini Vision] Model: ${model}`);
      console.log(`[Gemini Vision] Endpoint: ${endpoint}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  {
                    inline_data: {
                      mime_type: effectiveMimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: 'application/json',
              temperature: 0.0,
            },
          }),
        });

        clearTimeout(timeoutId);
        lastStatus = response.status;
        console.log(`[Gemini Vision] Response status: ${response.status}`);

        if (response.ok) {
          const resData = await response.json();
          const rawJsonText =
            resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

          if (!rawJsonText.trim()) {
            throw new Error('Empty text response from Gemini Vision API.');
          }

          const cleanJson = rawJsonText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed: GeminiParsedResponse = JSON.parse(cleanJson);

          const validDocTypes: DocumentType[] = ['structured_table', 'whatsapp_chat', 'statement_photo', 'pdf_document', 'unknown'];
          const rawDocType = (parsed.document_type || 'unknown') as DocumentType;
          const document_type: DocumentType = validDocTypes.includes(rawDocType) ? rawDocType : 'unknown';

          const document_warnings = parsed.document_warnings || [];
          const parsedRows: GeminiParsedRow[] = parsed.rows || [];

          const rows: ExtractedCommissionRow[] = parsedRows.map((r, idx: number) => {
            const polNum = (r.membership_or_policy_number || '').trim();
            const rawDate = (r.date || '').trim();
            const dateMatch = rawDate.match(/\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/);
            const payment_date = dateMatch ? dateMatch[1] : '';

            let amt = 0;
            if (typeof r.amount === 'number') {
              amt = r.amount;
            } else if (typeof r.amount === 'string') {
              const rawAmt = r.amount.trim();
              const isNegative = rawAmt.includes('(') || rawAmt.startsWith('-');
              const cleanAmt = parseFloat(rawAmt.replace(/[^0-9.]/g, ''));
              if (!isNaN(cleanAmt)) {
                amt = isNegative ? -cleanAmt : cleanAmt;
              }
            }

            let match_status: MatchStatus = 'UNMATCHED';
            let conf = typeof r.confidence === 'number' ? r.confidence : polNum ? 0.95 : 0.4;
            let confidence_reason = r.confidence_reason;

            if (!payment_date) {
              match_status = 'REVIEW';
              conf = Math.min(conf, 0.5);
              confidence_reason = confidence_reason || 'Payment date missing — verify before confirming';
            } else if (!polNum) {
              conf = Math.min(conf, 0.4);
              confidence_reason = confidence_reason || 'Missing policy number in line';
            }

            return {
              id: `vision-row-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
              payment_date,
              client_name: r.client_name || 'Extracted Client',
              membership_or_policy_number: polNum,
              carrier: r.carrier || 'P&C Carrier',
              transaction_code: r.transaction_code || '',
              commission_amount: amt,
              confidence: Math.max(0.0, Math.min(1.0, conf)),
              confidence_reason,
              warnings: r.warnings || [],
              raw_text: `${payment_date} ${r.client_name || ''} ${polNum} ${r.carrier || ''} ${amt}`,
              match_status,
            };
          });

          return {
            document_type,
            rows,
            document_warnings,
            extraction_method: 'vision_ai',
          };
        } else {
          lastErrorText = await response.text();
          console.warn(`[Gemini Vision] Model ${model} returned status ${response.status}: ${lastErrorText}`);
        }
      } catch (fetchErr: unknown) {
        clearTimeout(timeoutId);
        lastErrorText = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`[Gemini Vision] Error calling model ${model}:`, lastErrorText);
      }
    }

    throw new Error(`Gemini Vision API error (${lastStatus}): ${lastErrorText}`);
  }
}

