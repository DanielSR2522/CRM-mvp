import mammoth from 'mammoth';
import JSZip from 'jszip';
import DOMPurify from 'isomorphic-dompurify';

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function extractXmlText(xml: string): string {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi))
    .map((match) => decodeXml(match[1]))
    .join('');
}

async function renderXlsxWithZip(buffer: Buffer): Promise<{ html: string; sheetNames: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  const relationshipsEntry = zip.file('xl/_rels/workbook.xml.rels');

  if (!workbookEntry || !relationshipsEntry) {
    throw new Error('Invalid XLSX workbook structure.');
  }

  const [workbookXml, relationshipsXml, sharedStringsXml] = await Promise.all([
    workbookEntry.async('string'),
    relationshipsEntry.async('string'),
    zip.file('xl/sharedStrings.xml')?.async('string') ?? Promise.resolve(''),
  ]);

  const sharedStrings = Array.from(sharedStringsXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi))
    .map((match) => extractXmlText(match[1]));

  const relationshipTargets = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*?)\/?\s*>/gi)) {
    const attrs = match[1];
    const id = attrs.match(/\bId="([^"]+)"/i)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/i)?.[1];
    if (id && target) relationshipTargets.set(id, target);
  }

  const sheets: Array<{ name: string; relationshipId: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?\s*>/gi)) {
    const attrs = match[1];
    const name = attrs.match(/\bname="([^"]*)"/i)?.[1];
    const relationshipId = attrs.match(/\br:id="([^"]+)"/i)?.[1];
    if (name && relationshipId) {
      sheets.push({ name: decodeXml(name), relationshipId });
    }
  }

  let combinedHtml = '';

  for (const sheet of sheets) {
    const relationshipTarget = relationshipTargets.get(sheet.relationshipId);
    if (!relationshipTarget) continue;

    const normalizedTarget = relationshipTarget.startsWith('/')
      ? relationshipTarget.replace(/^\//, '')
      : `xl/${relationshipTarget.replace(/^\.\//, '')}`;
    const sheetEntry = zip.file(normalizedTarget);
    if (!sheetEntry) continue;

    const sheetXml = await sheetEntry.async('string');
    const rows: string[] = [];

    for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      const rowXml = rowMatch[1];
      const cells: string[] = [];

      for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const attrs = cellMatch[1];
        const cellXml = cellMatch[2];
        const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || '';
        let text = '';

        if (type === 'inlineStr') {
          text = extractXmlText(cellXml);
        } else {
          const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/i)?.[1] ?? '';
          if (type === 's') {
            const sharedIndex = Number.parseInt(rawValue, 10);
            text = Number.isInteger(sharedIndex) ? sharedStrings[sharedIndex] ?? '' : '';
          } else {
            text = decodeXml(rawValue);
          }
        }

        cells.push(`<td>${escapeHtml(text)}</td>`);
      }

      if (cells.length > 0) rows.push(`<tr>${cells.join('')}</tr>`);
    }

    combinedHtml += `
      <div style="margin-bottom: 2rem;">
        <div style="font-weight: 800; font-size: 0.875rem; color: #1e293b; margin-bottom: 0.75rem; padding-bottom: 0.35rem; border-bottom: 2px solid #e2e8f0; font-family: sans-serif;">
          Worksheet: ${escapeHtml(sheet.name)}
        </div>
        <div style="overflow-x: auto;" class="excel-table-container">
          <table>${rows.join('')}</table>
        </div>
      </div>
    `;
  }

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
    html: DOMPurify.sanitize(styledHtml),
    sheetNames: sheets.map((sheet) => sheet.name),
  };
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
    const result = await mammoth.convertToHtml({ buffer });
    const cleanHtml = DOMPurify.sanitize(result.value || '<p>Empty document</p>');
    return {
      type: 'html',
      html: `<div class="prose max-w-none p-6 font-sans text-slate-800 leading-relaxed bg-white rounded-xl shadow-xs border border-slate-100">${cleanHtml}</div>`,
      warning: result.messages.map((m) => m.message).join('; '),
    };
  }

  // 2. XLSX / XLS Handling
  // Legacy binary .xls preview intentionally stays disabled. Users can still
  // upload/download .xls documents without parsing untrusted legacy binaries.
  if (ext === 'xls' || mime.includes('ms-excel')) {
    return {
      type: 'html',
      html: '<div class="p-6 text-center text-slate-500 font-sans">Legacy XLS preview is disabled for security. Download the file to view it in a trusted spreadsheet application.</div>',
      warning: 'Legacy XLS preview disabled for security.',
    };
  }

  if (ext === 'xlsx' || mime.includes('spreadsheetml')) {
    const preview = await renderXlsxWithZip(buffer);
    return {
      type: 'html',
      html: preview.html,
      sheetNames: preview.sheetNames,
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
