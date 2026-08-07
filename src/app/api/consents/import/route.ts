import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import mammoth from 'mammoth';
import * as pdfParseModule from 'pdf-parse';
import DOMPurify from 'isomorphic-dompurify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

export async function POST(request: Request) {
  try {
    // 1. Authenticate Agent
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds maximum 10 MB limit.' },
        { status: 400 }
      );
    }

    const filename = file.name || 'document';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let html = '';
    let sourceType: 'docx' | 'txt' | 'pdf' = 'txt';
    let warning: string | undefined;
    let isScannedPdf = false;

    // 3. Process File according to type
    if (ext === 'docx' || file.type.includes('officedocument.wordprocessingml')) {
      sourceType = 'docx';
      const result = await mammoth.convertToHtml({ buffer });
      html = DOMPurify.sanitize(result.value || '<p></p>');
      if (result.messages.length > 0) {
        warning = result.messages.map(m => m.message).join('; ');
      }
    } else if (ext === 'txt' || file.type.startsWith('text/')) {
      sourceType = 'txt';
      const rawText = buffer.toString('utf8');
      const paragraphs = rawText.split(/\r?\n\r?\n/).map((p: string) => p.trim()).filter(Boolean);
      html = paragraphs.length > 0
        ? paragraphs.map((p: string) => `<p>${DOMPurify.sanitize(p).replace(/\n/g, '<br/>')}</p>`).join('')
        : `<p>${DOMPurify.sanitize(rawText)}</p>`;
    } else if (ext === 'pdf' || file.type.includes('pdf')) {
      sourceType = 'pdf';
      try {
        const parseFn = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule as any).default;
        const pdfData = await parseFn(buffer);
        const rawText = (pdfData?.text || '').trim();

        if (!rawText || rawText.length < 30) {
          isScannedPdf = true;
          html = '<p><em>(Scanned PDF - No selectable text extracted)</em></p>';
          warning = 'This PDF appears to be scanned or contains non-selectable text. Text extraction may be incomplete.';
        } else {
          const paragraphs = rawText.split(/\r?\n\r?\n/).map((p: string) => p.trim()).filter(Boolean);
          html = paragraphs.map((p: string) => `<p>${DOMPurify.sanitize(p).replace(/\n/g, '<br/>')}</p>`).join('');
          warning = 'PDF conversion extracts plain text and simple layouts. Headers, multi-column tables, and complex formatting may require review.';
        }
      } catch (pdfErr: any) {
        console.error('Server PDF parse error:', pdfErr);
        html = '<p><em>Unable to extract PDF text.</em></p>';
        warning = 'Failed to extract text from PDF. Verify the file is not encrypted or corrupted.';
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported file extension .${ext}. Only DOCX, TXT, and PDF are supported.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      html: html || '<p></p>',
      imported: {
        source_type: sourceType,
        source_filename: filename,
        warning,
        is_scanned_pdf: isScannedPdf,
        imported_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Server import error:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error processing document import.' },
      { status: 500 }
    );
  }
}
