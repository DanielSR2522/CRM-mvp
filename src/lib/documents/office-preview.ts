import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
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

  // 2. XLSX Handling
  // Legacy binary .xls preview intentionally stays disabled. The old SheetJS npm
  // package has unresolved high-severity advisories; users can still upload and
  // download .xls documents without parsing untrusted binary spreadsheet input.
  if (ext === 'xls' || mime.includes('ms-excel')) {
    return {
      type: 'html',
      html: '<div class="p-6 text-center text-slate-500 font-sans">Legacy XLS preview is disabled for security. Download the file to view it in a trusted spreadsheet application.</div>',
      warning: 'Legacy XLS preview disabled for security.',
    };
  }

  if (ext === 'xlsx' || mime.includes('spreadsheetml')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
    let combinedHtml = '';

    workbook.worksheets.forEach((worksheet) => {
      const rows: string[] = [];

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(`<td>${escapeHtml(cell.text || '')}</td>`);
        });
        rows.push(`<tr>${cells.join('')}</tr>`);
      });

      combinedHtml += `
        <div style="margin-bottom: 2rem;">
          <div style="font-weight: 800; font-size: 0.875rem; color: #1e293b; margin-bottom: 0.75rem; padding-bottom: 0.35rem; border-bottom: 2px solid #e2e8f0; font-family: sans-serif;">
            Worksheet: ${escapeHtml(worksheet.name)}
          </div>
          <div style="overflow-x: auto;" class="excel-table-container">
            <table>${rows.join('')}</table>
          </div>
        </div>
      `;
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
      html: DOMPurify.sanitize(styledHtml),
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
