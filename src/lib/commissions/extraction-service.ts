import * as pdfParseModule from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { ExtractedCommissionRow } from '@/types/commissions';

/**
 * Parses raw text extracted from documents/images line by line into structured ExtractedCommissionRow entries.
 */
export function parseCommissionRowsFromText(rawText: string): ExtractedCommissionRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 5);

  const extractedRows: ExtractedCommissionRow[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Regex for date: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD
    const dateMatch = line.match(/\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/);
    // Regex for currency amount: $123.45 or 123.45 at the end/near token
    const amountMatch = line.match(/\$?(\d{1,7}\.\d{2})\b/);

    if (!dateMatch && !amountMatch) {
      continue; // Skip header or non-data lines
    }

    const payment_date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
    const commission_amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    // Remove date and amount from line to find remaining tokens (Client Name, Policy #, Carrier)
    let remaining = line;
    if (dateMatch) remaining = remaining.replace(dateMatch[0], '');
    if (amountMatch) remaining = remaining.replace(amountMatch[0], '');

    remaining = remaining.replace(/\$/g, '').replace(/\s+/g, ' ').trim();
    const tokens = remaining.split(' ').filter(Boolean);

    let policy_or_membership_number = '';
    let carrier = '';
    const nameTokens: string[] = [];

    // Identify policy number token: token containing digits and/or uppercase letters (e.g., SIC3415864, 864824912, 6198-79-46-19/03766)
    for (const token of tokens) {
      const cleanToken = token.replace(/[,;]/g, '');
      if (
        !policy_or_membership_number &&
        (cleanToken.length >= 6 && /^[A-Za-z0-9\/-]{6,}$/.test(cleanToken) && /\d/.test(cleanToken))
      ) {
        policy_or_membership_number = cleanToken;
      } else if (
        ['progressive', 'geico', 'slide', 'state farm', 'allstate', 'liberty', 'oscar', 'humana', 'aetna'].some(
          (c) => cleanToken.toLowerCase().includes(c)
        )
      ) {
        carrier = carrier ? `${carrier} ${cleanToken}` : cleanToken;
      } else {
        nameTokens.push(cleanToken);
      }
    }

    // Fallback if no policy number detected directly: pick first token containing digits if present
    if (!policy_or_membership_number) {
      const candidateIndex = nameTokens.findIndex((t) => /\d{4,}/.test(t));
      if (candidateIndex !== -1) {
        policy_or_membership_number = nameTokens.splice(candidateIndex, 1)[0];
      }
    }

    const client_name = nameTokens.join(' ').trim() || 'Detected Client';
    if (!carrier) {
      carrier = 'P&C Carrier';
    }

    extractedRows.push({
      id: `row-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      payment_date,
      client_name,
      policy_or_membership_number,
      carrier,
      commission_amount,
      raw_text: line,
      match_status: 'NOT_FOUND',
    });
  }

  return extractedRows;
}

/**
 * Executes a Promise with a strict timeout limit.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMsg));
    }, timeoutMs);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function runOcrOnBuffer(buffer: Buffer): Promise<string> {
  const worker: any = await (createWorker as any)('eng');
  const result: any = await worker.recognize(buffer);
  await worker.terminate();
  const resAny: any = result;
  const dataAny: any = resAny ? resAny['data'] : null;
  const textVal: any = dataAny ? dataAny['text'] : '';
  return typeof textVal === 'string' ? textVal : '';
}

/**
 * Extracts commission text and structured rows from uploaded file Buffer.
 */
export async function extractCommissionsFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ rawText: string; rows: ExtractedCommissionRow[]; ocrWarning?: string }> {
  let rawText = '';
  let ocrWarning: string | undefined;

  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'pdf' || mimeType.includes('pdf')) {
    try {
      const parseFn = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule as any).default;
      const pdfData: any = await withTimeout(parseFn(buffer), 10000, 'PDF text extraction timed out after 10s.');
      rawText = (pdfData?.text || '').trim();
    } catch (pdfErr: any) {
      console.error('PDF extraction error:', pdfErr);
      ocrWarning = pdfErr?.message || 'Failed to extract text from PDF file.';
    }
  } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || mimeType.startsWith('image/')) {
    try {
      rawText = await withTimeout(runOcrOnBuffer(buffer), 30000, 'Image OCR processing timed out after 30s.');
    } catch (ocrErr: any) {
      console.error('Image OCR extraction error:', ocrErr?.message || ocrErr);
      ocrWarning = ocrErr?.message || 'Image OCR processing timed out or failed to initialize worker.';
    }
  } else {
    // Default plain text fallback
    rawText = buffer.toString('utf8');
  }

  const rows = parseCommissionRowsFromText(rawText);

  if (rows.length === 0 && !ocrWarning) {
    ocrWarning = 'No structured commission rows could be automatically detected in this file. Please verify document formatting.';
  }

  return { rawText, rows, ocrWarning };
}
