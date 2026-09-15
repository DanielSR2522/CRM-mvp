import { createWorker, PSM } from 'tesseract.js';
import path from 'path';
import sharp from 'sharp';
import { ExtractedCommissionRow, StructuredExtractionResult } from '@/types/commissions';
import { GeminiVisionProvider } from './providers/gemini-vision-provider';
import { IVisionExtractionProvider } from './providers/vision-provider-interface';

// Default MAX File Size: 10MB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface PdfParseResult {
  text?: string;
}

function preprocessOcrLines(rawText: string): string[] {
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const combinedLines: string[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const currentLine = rawLines[i];
    const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : null;

    const currentHasDate = /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/.test(currentLine);
    const currentHasAmount = /\$?\s*\d{1,7}\.\d{2}\b/.test(currentLine);
    const nextHasAmount = nextLine ? /\$?\s*\d{1,7}\.\d{2}\b/.test(nextLine) : false;
    const nextHasPolicy = nextLine ? /\b([A-Z0-9]{2,6}[0-9]{4,10}(?:-[A-Z0-9-]+)?|\d{6,12})\b/i.test(nextLine) : false;

    // If current line has a date but no amount, and next line has an amount or policy number, join them!
    if (currentHasDate && !currentHasAmount && nextLine && (nextHasAmount || nextHasPolicy)) {
      combinedLines.push(`${currentLine} ${nextLine}`);
      i += 2;
    } else {
      combinedLines.push(currentLine);
      i++;
    }
  }

  return combinedLines;
}

/**
 * Parses raw text extracted from documents/images line-by-line using layout heuristics into ExtractedCommissionRow entries.
 * NOTE: Contains NO hardcoded carrier lists or source-specific shortcuts.
 */
export function parseCommissionRowsFromText(
  rawText: string,
  words?: Array<{ text: string; bbox: TokenBbox }>
): ExtractedCommissionRow[] {
  const lines = preprocessOcrLines(rawText);

  const extractedRows: ExtractedCommissionRow[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Ignore headers, chat system messages, and generic conversational lines
    if (
      /^\s*(Commission Earned|ClientPolicy|hola\.\.\.aqui|please verify|Buenos dias|Hi Laura|Repase Los|Message)/i.test(line)
    ) {
      continue;
    }

    // Regex for date: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD
    const dateMatch = line.match(/\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/);
    // Regex for currency amount: $123.45 or 123.45
    const amountMatch = line.match(/\$?\s*(\d{1,7}\.\d{2})\b/);

    if (!dateMatch && !amountMatch) {
      continue;
    }

    const payment_date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
    const commission_amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    let remaining = line;
    if (dateMatch) remaining = remaining.replace(dateMatch[0], '');
    if (amountMatch) remaining = remaining.replace(amountMatch[0], '');

    remaining = remaining.replace(/\$/g, '').replace(/[«’'`;,]/g, ' ').replace(/\s+/g, ' ').trim();

    let transaction_code = '';
    // Extract 2-3 letter uppercase transaction codes like DV or LA at word boundary
    const txMatch = remaining.match(/\b(DV|LA|BOP|COMM)\b/);
    if (txMatch) {
      transaction_code = txMatch[1];
      remaining = remaining.replace(txMatch[0], '').trim();
    }

    let policy_or_membership_number = '';
    let carrier = '';

    // Handle concatenated tokens like "864824912Progressive" or "TRV102938Travelers"
    const concatMatch = remaining.match(/([A-Z0-9-]{6,16})\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (concatMatch && /\d/.test(concatMatch[1])) {
      policy_or_membership_number = concatMatch[1];
      carrier = concatMatch[2];
      remaining = remaining.replace(concatMatch[0], '').trim();
    } else {
      // Find policy number token
      const polMatch = remaining.match(/\b([A-Z0-9]{2,6}[0-9]{4,10}(?:-[A-Z0-9-]+)?|\d{6,12})\b/i);
      if (polMatch) {
        policy_or_membership_number = polMatch[1];
        remaining = remaining.replace(polMatch[0], '').trim();
      }
    }

    // Dynamic carrier extraction from remaining tokens if not already found from concatenated match
    const tokens = remaining.split(' ').filter(Boolean);

    if (!carrier && tokens.length > 0) {
      // If last 1 or 2 tokens start with an uppercase letter, treat them as dynamic carrier (e.g., Travelers, US Assure, Slide)
      const lastToken = tokens[tokens.length - 1];
      if (/^[A-Z][a-zA-Z0-9&.-]+$/i.test(lastToken) && tokens.length >= 2) {
        // If second to last is also capitalized (e.g. US Assure, United Auto)
        const secondLast = tokens[tokens.length - 2];
        if (/^[A-Z][a-zA-Z0-9&.-]+$/i.test(secondLast) && tokens.length >= 3) {
          carrier = `${secondLast} ${lastToken}`;
          tokens.splice(tokens.length - 2, 2);
        } else {
          carrier = lastToken;
          tokens.splice(tokens.length - 1, 1);
        }
      }
    }

    const client_name = tokens.join(' ').trim() || 'Extracted Client';

    if (!carrier) {
      carrier = 'P&C Carrier';
    }

    // Match bounding box if available
    let bbox: TokenBbox | undefined = undefined;
    if (policy_or_membership_number && words && words.length > 0) {
      const normPol = policy_or_membership_number.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchedWord = words.find((w) => {
        const wNorm = w.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        return wNorm && (wNorm.includes(normPol) || normPol.includes(wNorm));
      });
      if (matchedWord) {
        bbox = matchedWord.bbox;
      }
    }

    // Confidence scoring
    let confidence = 1.0;
    let confidence_reason: string | undefined = undefined;

    if (!policy_or_membership_number) {
      confidence = 0.4;
      confidence_reason = 'Missing policy or member ID in source document line';
    } else if (client_name === 'Extracted Client' || !dateMatch) {
      confidence = 0.6;
      confidence_reason = 'Partial line extraction - verify client details';
    }

    extractedRows.push({
      id: `ocr-row-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      payment_date,
      client_name,
      membership_or_policy_number: policy_or_membership_number,
      carrier,
      transaction_code,
      commission_amount,
      confidence,
      confidence_reason,
      raw_text: line,
      bbox,
      match_status: 'UNMATCHED',
    });
  }

  return extractedRows;
}

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
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

export interface TokenBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Focused Second OCR Pass on Member ID Region/Cell
 * Upscales the region significantly with Sharp, enhances contrast/sharpness,
 * and recognizes using Tesseract token mode with alphanumeric character whitelist.
 */
export async function performFocusedMemberIdOcr(
  fileBuffer: Buffer,
  bbox: TokenBbox
): Promise<string> {
  try {
    const meta = await sharp(fileBuffer).metadata();
    if (!meta.width || !meta.height) return '';

    const padLeft = 35;
    const padRight = 20;
    const padTop = 2;
    const padBottom = 2;

    const cropLeft = Math.max(0, bbox.x0 - padLeft);
    const cropTop = Math.max(0, bbox.y0 - padTop);
    const cropWidth = Math.min(meta.width - cropLeft, (bbox.x1 - bbox.x0) + padLeft + padRight);
    const cropHeight = Math.min(meta.height - cropTop, (bbox.y1 - bbox.y0) + padTop + padBottom);

    const processedCropBuffer = await sharp(fileBuffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .resize({ width: cropWidth * 3, kernel: 'lanczos3' })
      .sharpen()
      .grayscale()
      .normalize()
      .toBuffer();

    const worker = await createWorker('eng', 1);

    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });

    const result = await worker.recognize(processedCropBuffer);
    await worker.terminate();

    const rawToken = (result.data.text || '').trim();
    const cleanToken = rawToken.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
    console.log(`[Focused Member ID OCR] Pass 2 Crop Result: "${cleanToken}"`);
    return cleanToken;
  } catch (err) {
    console.error('[Focused Member ID OCR Error]:', err);
    return '';
  }
}

interface TesseractWord {
  text?: string;
  bbox?: TokenBbox;
}
interface TesseractLine {
  words?: TesseractWord[];
}
interface TesseractParagraph {
  lines?: TesseractLine[];
}
interface TesseractBlock {
  paragraphs?: TesseractParagraph[];
}
interface TesseractRecognizeData {
  text?: string;
  blocks?: TesseractBlock[];
}

async function runOcrOnBuffer(buffer: Buffer): Promise<{ rawText: string; words: Array<{ text: string; bbox: TokenBbox }> }> {
  console.log('[OCR Fallback] Started');
  console.log('[OCR Fallback] Initializing Tesseract worker...');

  const worker = await createWorker('eng', 1);
  console.log('[OCR Fallback] Worker ready');

  console.log('[OCR Fallback] Recognizing buffer image text with bounding boxes...');
  const result = await worker.recognize(buffer, {}, { blocks: true } as unknown as Record<string, unknown>);
  console.log('[OCR Fallback] Recognition complete');

  await worker.terminate();
  const data = result.data as unknown as TesseractRecognizeData;
  const textVal = data?.text || '';
  const rawText = typeof textVal === 'string' ? textVal : '';

  const words: Array<{ text: string; bbox: TokenBbox }> = [];
  if (data?.blocks) {
    data.blocks.forEach((b) => {
      if (b.paragraphs) {
        b.paragraphs.forEach((p) => {
          if (p.lines) {
            p.lines.forEach((l) => {
              if (l.words) {
                l.words.forEach((w) => {
                  if (w.text && w.bbox) {
                    words.push({ text: w.text.trim(), bbox: w.bbox });
                  }
                });
              }
            });
          }
        });
      }
    });
  }

  return { rawText, words };
}

/**
 * Main Hybrid Multimodal Document Extractor Entry Point
 * Tries Vision AI primary provider (Gemini Flash Vision) if available, falling back to OCR if missing, timed out, or errored.
 */
export async function extractCommissionDocument(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<StructuredExtractionResult> {
  // 1. Production Safety Checks: File Size & Type
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size exceeds 10MB limit (${(fileBuffer.length / (1024 * 1024)).toFixed(2)}MB).`);
  }

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isPdf = ext === 'pdf' || mimeType.includes('pdf');
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    throw new Error('Unsupported file format. Supported formats: JPG, JPEG, PNG, WEBP, PDF.');
  }

  const document_warnings: string[] = [];

  // 2. Multimodal Vision Provider Primary Pipeline
  const visionProvider: IVisionExtractionProvider = new GeminiVisionProvider();

  if (visionProvider.isAvailable()) {
    try {
      console.log(`[Extraction Pipeline] Executing Primary Provider: ${visionProvider.name}`);
      const visionResult = await visionProvider.extract(fileBuffer, mimeType, filename);
      if (visionResult && visionResult.rows.length > 0) {
        console.log(`[Extraction Pipeline] Multimodal Vision AI extracted ${visionResult.rows.length} rows successfully.`);
        return visionResult;
      }
    } catch (visionErr: unknown) {
      const msg = visionErr instanceof Error ? visionErr.message : String(visionErr);
      console.warn(`[Extraction Pipeline] Gemini Vision unavailable. Logged server details: ${msg}`);
      // User-facing message should ONLY be "Vision AI unavailable — processing locally."
      document_warnings.push('Vision AI unavailable — processing locally.');
    }
  } else {
    console.log('[Extraction Pipeline] GEMINI_API_KEY missing or vision provider unavailable. Using OCR fallback.');
    document_warnings.push('Vision AI unavailable — processing locally.');
  }

  // 3. Fallback Pipeline: Tesseract OCR / PDF Text Parsing
  let rawText = '';
  let words: Array<{ text: string; bbox: TokenBbox }> = [];

  if (isPdf) {
    try {
      const pdfParseModule = await import('pdf-parse');
      if (typeof (pdfParseModule as any).PDFParse === 'function') {
        const parser = new (pdfParseModule as any).PDFParse({ data: fileBuffer });
        const textResult = (await withTimeout(parser.getText(), 10000, 'PDF text extraction timed out after 10s.')) as PdfParseResult;
        rawText = (textResult?.text || '').trim();
      } else {
        type PdfParseFn = (b: Buffer) => Promise<PdfParseResult>;
        const parseFn: PdfParseFn = (
          typeof pdfParseModule === 'function'
            ? pdfParseModule
            : (pdfParseModule as unknown as { default: PdfParseFn }).default
        ) as unknown as PdfParseFn;
        if (typeof parseFn === 'function') {
          const pdfData = await withTimeout(parseFn(fileBuffer), 10000, 'PDF text extraction timed out after 10s.');
          rawText = (pdfData?.text || '').trim();
        }
      }
    } catch (pdfErr: unknown) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.error('[OCR Fallback PDF Error]:', pdfErr);
      document_warnings.push(msg || 'Failed to extract text from PDF file.');
    }
  } else {
    try {
      const ocrData = await withTimeout(runOcrOnBuffer(fileBuffer), 25000, 'OCR processing timed out after 25s.');
      rawText = ocrData.rawText;
      words = ocrData.words;
    } catch (ocrErr: unknown) {
      console.error('[OCR Engine Diagnostic Error]:', ocrErr);
      throw new Error('OCR engine unavailable');
    }
  }

  console.log('[OCR Fallback] Parsing OCR text into commission rows...');
  const rows = parseCommissionRowsFromText(rawText, words);
  console.log(`[OCR Fallback] Parsed rows: ${rows.length}`);

  if (rows.length === 0 && !document_warnings.some((w) => w.includes('No structured'))) {
    document_warnings.push('No structured commission rows could be automatically detected in fallback OCR. Please verify formatting.');
  }

  return {
    document_type: isPdf ? 'pdf_document' : 'statement_photo',
    rows,
    document_warnings,
    extraction_method: 'ocr_fallback',
  };
}

// Backward compatibility helper
export async function extractCommissionsFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ rawText: string; rows: ExtractedCommissionRow[]; ocrWarning?: string }> {
  const result = await extractCommissionDocument(buffer, mimeType, filename);
  return {
    rawText: result.rows.map((r) => r.raw_text || '').join('\n'),
    rows: result.rows,
    ocrWarning: result.document_warnings[0],
  };
}
