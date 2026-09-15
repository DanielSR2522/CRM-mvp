import { IVisionExtractionProvider } from './vision-provider-interface';
import { StructuredExtractionResult, ExtractedCommissionRow } from '@/types/commissions';

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
  name = 'Gemini Flash Vision';

  isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  async extract(fileBuffer: Buffer, mimeType: string, filename: string): Promise<StructuredExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }

    const base64Data = fileBuffer.toString('base64');
    const effectiveMimeType = mimeType.includes('pdf')
      ? 'application/pdf'
      : mimeType.startsWith('image/')
      ? mimeType
      : filename.endsWith('.pdf')
      ? 'application/pdf'
      : 'image/png';

    const promptText = `
You are an expert P&C Insurance Commission Document AI extractor.
Analyze the attached document/image (which could be a structured statement table, WhatsApp chat screenshot, scan, photo, or PDF) and extract ALL commission rows.

CRITICAL INSTRUCTIONS:
1. Extract ALL commission rows present in the document.
2. For each row extract:
   - date: payment/statement date in MM/DD/YYYY or YYYY-MM-DD format.
   - client_name: full name of the client/insured.
   - membership_or_policy_number: policy ID or membership number as written (e.g., "SIC3415864", "NXTYQR3KTH-00-PL", "864824912", "SIF0021341"). If missing/truncated, set to empty string "". NEVER invent or guess a policy number.
   - carrier: exact insurance carrier name as shown (e.g., "Slide", "Progressive", "Next", "US Assure", "Travelers", "United Auto", etc.). Extract whatever carrier is clearly shown.
   - transaction_code: transaction or product code if present (e.g., "DV", "LA", "BOP", "COMM"). If none, use empty string "".
   - amount: numeric commission dollar amount as a float (e.g., 230.76).
   - confidence: float between 0.0 and 1.0 reflecting extraction certainty. Use 1.0 for clearly readable complete rows. Use 0.4 - 0.6 if policy number or client name is missing/truncated/blurry.
   - confidence_reason: string explaining reason if confidence < 0.8 (e.g. "Missing policy number in line").
3. Determine document_type: one of "structured_table", "whatsapp_chat", "statement_photo", "pdf_document", "unknown".
4. NEVER invent fictitious client names or policy numbers.
5. Return ONLY a valid JSON object matching this exact schema:

{
  "document_type": "structured_table",
  "rows": [
    {
      "date": "07/30/2026",
      "client_name": "Denise Reinoso Chao",
      "membership_or_policy_number": "SIC3415864",
      "carrier": "Slide",
      "transaction_code": "DV",
      "amount": 230.76,
      "confidence": 1.0,
      "confidence_reason": "",
      "warnings": []
    }
  ],
  "document_warnings": []
}
`;

    // Active Flash multimodal models appropriate for document/image extraction
    const modelsToTry = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash'];

    let lastErrorText = '';
    let lastStatus = 500;

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      console.log(`[Gemini Vision] Model: ${model}`);
      console.log(`[Gemini Vision] Endpoint: ${endpoint}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

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
              temperature: 0.1,
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
            const conf = typeof r.confidence === 'number' ? r.confidence : polNum ? 0.95 : 0.4;
            const amt = typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount)) || 0;

            return {
              id: `vision-row-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
              payment_date: r.date || new Date().toISOString().split('T')[0],
              client_name: r.client_name || 'Extracted Client',
              membership_or_policy_number: polNum,
              carrier: r.carrier || 'P&C Carrier',
              transaction_code: r.transaction_code || '',
              commission_amount: amt,
              confidence: Math.max(0.0, Math.min(1.0, conf)),
              confidence_reason: r.confidence_reason || (polNum ? undefined : 'Missing policy number in extraction'),
              warnings: r.warnings || [],
              raw_text: `${r.date || ''} ${r.client_name || ''} ${polNum} ${r.carrier || ''} ${amt}`,
              match_status: 'UNMATCHED',
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
