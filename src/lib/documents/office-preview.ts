import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

/**
 * Server-safe HTML sanitizer that strips executable script tags, iframe, object, embed,
 * inline event handlers (onerror, onload, onclick, etc.), and javascript: URIs
 * without loading DOM/jsdom dependencies into Node serverless runtime.
 */
export function sanitizeServerHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  let sanitized = rawHtml;

  // 1. Strip dangerous tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  sanitized = sanitized.replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '');

  // 2. Strip event handlers (on*="...")
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 3. Neutralize javascript: or vbscript: or data:text/html URIs
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html):[^"'\s>]+/gi, '$1="#"');

  return sanitized;
}

export interface OfficeSlide {
  slideNumber: number;
  title?: string;
  textContent: string[];
}

export interface OfficePreviewResult {
  type: 'html' | 'slides';
  html?: string;
  slides?: OfficeSlide[];
  sheetNames?: string[];
  warning?: string;
}

export async function renderOfficeDocument(
  buffer: Buffer,
  fileName: string,
  mimeType?: string | null
): Promise<OfficePreviewResult> {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  // 1. DOCX Handling
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      const cleanHtml = sanitizeServerHtml(result.value || '<p>Empty document</p>');
      return {
        type: 'html',
        html: `<div class="prose max-w-none p-6 font-sans text-slate-800 leading-relaxed bg-white rounded-xl shadow-xs border border-slate-100">${cleanHtml}</div>`,
        warning: result.messages.map((m) => m.message).join('; '),
      };
    } catch (mammothErr: any) {
      console.warn('Mammoth DOCX render failed, attempting XML fallback extractor:', mammothErr?.message);
      try {
        const fallbackHtml = await extractDocxTextFallback(buffer);
        return {
          type: 'html',
          html: `<div class="prose max-w-none p-6 font-sans text-slate-800 leading-relaxed bg-white rounded-xl shadow-xs border border-slate-100">${fallbackHtml}</div>`,
          warning: 'Rendered using fallback XML extractor',
        };
      } catch (fallbackErr: any) {
        throw new Error(`DOCX_RENDER_FAILED: ${mammothErr?.message || 'Mammoth rendering failed'}`);
      }
    }
  }

  // 2. XLSX / XLS Handling
  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheetml') || mime.includes('ms-excel')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames || [];
    let combinedHtml = '';

    sheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        const tableHtml = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
        const sanitizedTable = sanitizeServerHtml(tableHtml);
        combinedHtml += `
          <div style="margin-bottom: 2rem;">
            <div style="font-weight: 800; font-size: 0.875rem; color: #1e293b; margin-bottom: 0.75rem; padding-bottom: 0.35rem; border-bottom: 2px solid #e2e8f0; font-family: sans-serif;">
              Worksheet: ${sheetName}
            </div>
            <div style="overflow-x: auto;" class="excel-table-container">
              ${sanitizedTable}
            </div>
          </div>
        `;
      }
    });

    const styledHtml = `
      <style>
        .excel-table-container table { border-collapse: collapse; width: 100%; font-size: 12px; font-family: sans-serif; }
        .excel-table-container td, .excel-table-container th { border: 1px solid #cbd5e1; padding: 7px 12px; text-align: left; }
        .excel-table-container th { background-color: #f1f5f9; font-weight: 700; color: #334155; }
        .excel-table-container tr:nth-child(even) { background-color: #f8fafc; }
        .excel-table-container tr:hover { background-color: #f1f5f9; }
      </style>
      <div class="p-4 font-sans text-slate-800 bg-white rounded-xl shadow-xs border border-slate-100">${combinedHtml || '<p>No data in spreadsheet</p>'}</div>
    `;

    return {
      type: 'html',
      html: styledHtml,
      sheetNames,
    };
  }

  // 3. PPTX Handling
  if (ext === 'pptx' || mime.includes('presentationml')) {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });

    if (slideFiles.length === 0) {
      return {
        type: 'html',
        html: '<div class="p-6 text-center text-slate-500 font-sans">No slides found in presentation.</div>',
      };
    }

    const slides: OfficeSlide[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const filePath = slideFiles[i];
      const xmlText = await zip.files[filePath].async('string');

      const textMatches = Array.from(xmlText.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/gi)).map((m) => m[1]);
      const cleanTexts = textMatches
        .map((t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
        .filter((t) => t.trim().length > 0);

      slides.push({
        slideNumber: i + 1,
        title: cleanTexts[0] || `Slide ${i + 1}`,
        textContent: cleanTexts,
      });
    }

    return {
      type: 'slides',
      slides,
    };
  }

  throw new Error('Unsupported Office document format for preview rendering.');
}

/**
 * Fallback DOCX text extractor using JSZip to parse word/document.xml
 * used when Mammoth rendering encounters incompatible structures.
 */
export async function extractDocxTextFallback(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.files['word/document.xml'];
  if (!documentXml) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  const xmlText = await documentXml.async('string');
  const paragraphMatches = Array.from(xmlText.matchAll(/<w:p(?:\s|>)([\s\S]*?)<\/w:p>/gi));
  
  const paragraphs: string[] = [];

  for (const pMatch of paragraphMatches) {
    const pContent = pMatch[1];
    const textMatches = Array.from(pContent.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)).map((m) => m[1]);
    const pText = textMatches
      .join('')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();

    if (pText.length > 0) {
      paragraphs.push(`<p>${sanitizeServerHtml(pText)}</p>`);
    }
  }

  if (paragraphs.length === 0) {
    return '<p>Empty document</p>';
  }

  return paragraphs.join('\n');
}
