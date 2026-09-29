import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { fetchOfficeDocumentPreview } from '../fetch-preview.js';
import { renderOfficeDocument } from '../office-preview.js';

describe('Office Document Preview Fetcher (fetchOfficeDocumentPreview)', () => {
  it('successfully fetches and returns JSON preview payload', async () => {
    const mockPreviewData = {
      type: 'html' as const,
      html: '<p>Sample rendered content</p>',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(url.toString(), '/api/documents/preview');
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.source, 'health');
      assert.equal(body.docId, 'doc-123');

      return new Response(JSON.stringify(mockPreviewData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await fetchOfficeDocumentPreview('health', 'doc-123');
      assert.equal(result.type, 'html');
      assert.equal(result.html, '<p>Sample rendered content</p>');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws structured error message on JSON HTTP error response (403)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: 'Access denied to document' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchOfficeDocumentPreview('property_casualty', 'unauthorized-doc');
        },
        {
          name: 'Error',
          message: 'Access denied to document',
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('defensively handles non-JSON HTML error responses (500 Server Error) without SyntaxError', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response('<!DOCTYPE html><html><body>500 Internal Server Error</body></html>', {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        async () => {
          await fetchOfficeDocumentPreview('health', 'broken-doc');
        },
        (err: any) => {
          // Must be an Error with a clean message, NOT SyntaxError: Unexpected token '<'
          assert.equal(err instanceof Error, true);
          assert.equal(err.name, 'Error');
          assert.match(err.message, /Unable to generate a preview for this document/);
          assert.doesNotMatch(err.message, /Unexpected token/);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Office Document Rendering Engine (renderOfficeDocument)', () => {
  it('renders DOCX document into sanitized HTML payload', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello Health Policy Document</w:t></w:r></w:p></w:body></w:document>'
    );
    const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await renderOfficeDocument(docxBuffer, 'listado Mariela.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    assert.equal(result.type, 'html');
    assert.match(result.html || '', /Hello Health Policy Document/);
    assert.match(result.html || '', /<div class="prose/);
  });

  it('renders XLSX spreadsheet into sanitized HTML table with sheet names', async () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Policy Number', 'Client Name', 'Premium'],
      ['POL-1001', 'Jane Doe', 1500],
      ['POL-1002', 'John Smith', 2200],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Policy Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = await renderOfficeDocument(buffer, 'policies.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    assert.equal(result.type, 'html');
    assert.deepEqual(result.sheetNames, ['Policy Summary']);
    assert.match(result.html || '', /Worksheet: Policy Summary/);
    assert.match(result.html || '', /POL-1001/);
    assert.match(result.html || '', /Jane Doe/);
  });

  it('extracts text via XML fallback if primary renderer encounters incompatible structure', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:t>Fallback Extracted Paragraph Text</w:t></w:p></w:body></w:document>'
    );
    const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const { extractDocxTextFallback } = await import('../office-preview.js');
    const fallbackHtml = await extractDocxTextFallback(docxBuffer);
    assert.match(fallbackHtml, /Fallback Extracted Paragraph Text/);
    assert.match(fallbackHtml, /<p>/);
  });

  it('handles unsupported extension gracefully', async () => {
    const dummyBuffer = Buffer.from('PDF file content');
    await assert.rejects(
      async () => {
        await renderOfficeDocument(dummyBuffer, 'document.pdf', 'application/pdf');
      },
      (err: any) => {
        assert.match(err.message, /Unsupported Office document format/);
        return true;
      }
    );
  });
});
