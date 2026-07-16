/**
 * Signed PDF and audit certificate.
 *
 * Built server-side from `rendered_content` — the frozen document, never a fresh
 * merge. That is what makes the PDF and the hash describe the same thing the
 * client actually read.
 *
 * pdf-lib only, no headless browser: a PDF renderer that needs Chromium would
 * cost more than this whole module. The trade-off is that layout here is manual
 * — measured text, explicit wrapping, explicit pagination. Worth it.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { createHash } from 'crypto';
import type { TemplateBlock, TemplateContent } from '@/lib/consents/types';

// ---------------------------------------------------------------------------
// Page geometry — US Letter, in points
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = MARGIN + 40; // leaves room for the page number

const INK = rgb(0.1, 0.11, 0.14);
const MUTED = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.8, 0.82, 0.85);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/**
 * A cursor that knows how to start a new page.
 *
 * Pagination is the only genuinely fiddly part of this file: every draw has to
 * ask whether it still fits, and a block that does not must not be split in a
 * way that orphans a heading from its paragraph.
 */
class Layout {
  page: PDFPage;
  y: number;
  private pageCount = 1;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Adds a page if `needed` points would run past the bottom. */
  ensure(needed: number): void {
    if (this.y - needed >= BOTTOM_LIMIT) return;
    this.newPage();
  }

  newPage(): void {
    this.stampPageNumber();
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    this.pageCount += 1;
  }

  private stampPageNumber(): void {
    this.page.drawText(String(this.pageCount), {
      x: PAGE_WIDTH / 2,
      y: MARGIN - 20,
      size: 8,
      font: this.fonts.regular,
      color: MUTED,
    });
  }

  finish(): void {
    this.stampPageNumber();
  }
}

/**
 * Greedy word wrap against real measured widths.
 *
 * A character-count approximation drifts badly with proportional fonts — the
 * difference between a clean document and one with text running off the page.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // A single word wider than the line: hard-break it rather than overflow.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/**
 * WinAnsi is all the standard fonts encode. An em dash or a smart quote — both
 * of which our own templates emit — would throw at draw time, taking the whole
 * PDF with it. Substituting is better than failing on punctuation.
 */
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Anything still outside Latin-1 becomes '?', which is ugly but survivable.
    .replace(/[^\x00-\xFF]/g, '?');
}

function drawLines(
  layout: Layout,
  lines: string[],
  font: PDFFont,
  size: number,
  lineHeight: number,
  x = MARGIN
): void {
  for (const line of lines) {
    layout.ensure(lineHeight);
    layout.page.drawText(toWinAnsi(line), { x, y: layout.y - size, size, font, color: INK });
    layout.y -= lineHeight;
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function drawBlock(layout: Layout, block: TemplateBlock, fonts: Fonts): void {
  switch (block.type) {
    case 'heading': {
      const size = block.level === 1 ? 18 : block.level === 2 ? 14 : 11;
      const lines = wrapText(block.text, fonts.bold, size, CONTENT_WIDTH);
      // Keep a heading with what follows: if only the heading would fit, break first.
      layout.ensure(lines.length * (size + 6) + 24);
      layout.y -= 8;
      drawLines(layout, lines, fonts.bold, size, size + 6);
      layout.y -= 4;
      break;
    }

    case 'paragraph': {
      const lines = wrapText(block.text, fonts.regular, 10, CONTENT_WIDTH);
      drawLines(layout, lines, fonts.regular, 10, 15);
      layout.y -= 6;
      break;
    }

    case 'bullet_list':
    case 'numbered_list': {
      block.items.forEach((item, i) => {
        const marker = block.type === 'numbered_list' ? `${i + 1}.` : '•';
        const indent = 18;
        const lines = wrapText(item, fonts.regular, 10, CONTENT_WIDTH - indent);

        layout.ensure(15);
        layout.page.drawText(toWinAnsi(marker), {
          x: MARGIN,
          y: layout.y - 10,
          size: 10,
          font: fonts.regular,
          color: INK,
        });
        drawLines(layout, lines, fonts.regular, 10, 15, MARGIN + indent);
      });
      layout.y -= 6;
      break;
    }

    case 'divider': {
      layout.ensure(16);
      layout.y -= 8;
      layout.page.drawLine({
        start: { x: MARGIN, y: layout.y },
        end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
        thickness: 0.5,
        color: LINE,
      });
      layout.y -= 8;
      break;
    }

    case 'spacer': {
      const heights = { small: 8, medium: 16, large: 32 };
      layout.y -= heights[block.size] ?? 16;
      break;
    }

    case 'consent': {
      const lines = wrapText(block.text, fonts.regular, 10, CONTENT_WIDTH - 20);
      const boxHeight = lines.length * 14 + 16;
      layout.ensure(boxHeight + 12);
      layout.y -= 6;

      layout.page.drawRectangle({
        x: MARGIN,
        y: layout.y - boxHeight,
        width: CONTENT_WIDTH,
        height: boxHeight,
        borderColor: LINE,
        borderWidth: 0.5,
        color: rgb(0.97, 0.98, 1),
      });
      layout.y -= 10;
      drawLines(layout, lines, fonts.regular, 10, 14, MARGIN + 10);
      layout.y -= 12;
      break;
    }

    case 'signature_placeholder':
    case 'date':
      // Drawn by the signature section instead, with the real signature in it.
      break;

    case 'footer': {
      const lines = wrapText(block.text, fonts.italic, 8, CONTENT_WIDTH);
      layout.ensure(lines.length * 11 + 12);
      layout.y -= 8;
      layout.page.drawLine({
        start: { x: MARGIN, y: layout.y },
        end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
        thickness: 0.5,
        color: LINE,
      });
      layout.y -= 8;
      for (const line of lines) {
        layout.ensure(11);
        layout.page.drawText(toWinAnsi(line), {
          x: MARGIN,
          y: layout.y - 8,
          size: 8,
          font: fonts.italic,
          color: MUTED,
        });
        layout.y -= 11;
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Signed document
// ---------------------------------------------------------------------------

export interface SignedPdfInput {
  title: string;
  agencyName: string | null;
  clientName: string;
  content: TemplateContent;
  consentText: string;
  signerName: string;
  signatureMethod: 'draw' | 'typed';
  /** PNG bytes, for method 'draw'. */
  signatureImage: Uint8Array | null;
  typedSignature: string | null;
  signedAt: Date;
  documentHash: string;
}

export interface GeneratedPdf {
  bytes: Uint8Array;
  sha256: string;
}

export async function buildSignedPdf(input: SignedPdfInput): Promise<GeneratedPdf> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setProducer('SmarTrack CRM');
  doc.setCreationDate(input.signedAt);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  const layout = new Layout(doc, fonts);

  // ---- Header ----------------------------------------------------------
  if (input.agencyName) {
    layout.page.drawText(toWinAnsi(input.agencyName), {
      x: MARGIN,
      y: layout.y - 9,
      size: 9,
      font: fonts.bold,
      color: MUTED,
    });
    layout.y -= 20;
  }

  drawLines(layout, wrapText(input.title, fonts.bold, 20, CONTENT_WIDTH), fonts.bold, 20, 26);
  layout.y -= 4;
  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
    thickness: 1,
    color: LINE,
  });
  layout.y -= 20;

  // ---- Body ------------------------------------------------------------
  for (const block of input.content.blocks) {
    drawBlock(layout, block, fonts);
  }

  // ---- Signature -------------------------------------------------------
  layout.ensure(170);
  layout.y -= 20;
  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
    thickness: 0.5,
    color: LINE,
  });
  layout.y -= 18;

  layout.page.drawText('ELECTRONIC SIGNATURE', {
    x: MARGIN,
    y: layout.y - 8,
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });
  layout.y -= 22;

  // Consent wording, verbatim, above the signature it authorised.
  const consentLines = wrapText(input.consentText, fonts.italic, 8, CONTENT_WIDTH);
  for (const line of consentLines) {
    layout.ensure(11);
    layout.page.drawText(toWinAnsi(line), {
      x: MARGIN,
      y: layout.y - 8,
      size: 8,
      font: fonts.italic,
      color: MUTED,
    });
    layout.y -= 11;
  }
  layout.y -= 12;

  if (input.signatureMethod === 'draw' && input.signatureImage) {
    const png = await doc.embedPng(input.signatureImage);
    // Fit inside a 220x60 box without distorting the drawing.
    const maxW = 220;
    const maxH = 60;
    const scale = Math.min(maxW / png.width, maxH / png.height, 1);
    const w = png.width * scale;
    const h = png.height * scale;

    layout.ensure(h + 30);
    layout.page.drawImage(png, { x: MARGIN, y: layout.y - h, width: w, height: h });
    layout.y -= h + 4;
  } else if (input.typedSignature) {
    layout.ensure(40);
    layout.page.drawText(toWinAnsi(input.typedSignature), {
      x: MARGIN,
      y: layout.y - 20,
      size: 20,
      font: fonts.italic,
      color: INK,
    });
    layout.y -= 28;
  }

  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: MARGIN + 240, y: layout.y },
    thickness: 0.5,
    color: INK,
  });
  layout.y -= 12;

  layout.page.drawText(toWinAnsi(input.signerName), {
    x: MARGIN,
    y: layout.y - 8,
    size: 9,
    font: fonts.bold,
    color: INK,
  });
  layout.y -= 13;

  layout.page.drawText(
    toWinAnsi(
      `Signed ${formatDateTime(input.signedAt)} · ${
        input.signatureMethod === 'draw' ? 'Drawn signature' : 'Typed signature'
      }`
    ),
    { x: MARGIN, y: layout.y - 8, size: 8, font: fonts.regular, color: MUTED }
  );
  layout.y -= 16;

  layout.page.drawText(toWinAnsi(`Document SHA-256: ${input.documentHash}`), {
    x: MARGIN,
    y: layout.y - 7,
    size: 6.5,
    font: fonts.regular,
    color: MUTED,
  });

  layout.finish();

  const bytes = await doc.save();
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

// ---------------------------------------------------------------------------
// Audit certificate
// ---------------------------------------------------------------------------

export interface AuditEventRow {
  event_type: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  channel: string | null;
}

export interface AuditCertificateInput {
  title: string;
  agencyName: string | null;
  clientName: string;
  signerName: string;
  signerEmail: string | null;
  signerPhone: string | null;
  requestId: string;
  signerId: string;
  documentHash: string;
  signedPdfHash: string;
  signatureMethod: 'draw' | 'typed';
  consentText: string;
  consentAcceptedAt: Date | null;
  signedAt: Date;
  events: AuditEventRow[];
}

/**
 * The certificate: who signed what, when, from where, and how we know.
 *
 * Separate from the signed document because it serves a different reader. The
 * document is for the client; this is for whoever later has to prove the
 * signature was real — a carrier, a lawyer, a regulator.
 */
export async function buildAuditCertificate(input: AuditCertificateInput): Promise<GeneratedPdf> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Audit certificate - ${input.title}`);
  doc.setProducer('SmarTrack CRM');
  doc.setCreationDate(input.signedAt);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  const layout = new Layout(doc, fonts);

  layout.page.drawText('SIGNATURE AUDIT CERTIFICATE', {
    x: MARGIN,
    y: layout.y - 16,
    size: 16,
    font: fonts.bold,
    color: INK,
  });
  layout.y -= 26;

  if (input.agencyName) {
    layout.page.drawText(toWinAnsi(input.agencyName), {
      x: MARGIN,
      y: layout.y - 9,
      size: 9,
      font: fonts.regular,
      color: MUTED,
    });
    layout.y -= 18;
  }

  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
    thickness: 1,
    color: LINE,
  });
  layout.y -= 20;

  const field = (label: string, value: string) => {
    layout.ensure(15);
    layout.page.drawText(toWinAnsi(label), {
      x: MARGIN,
      y: layout.y - 8,
      size: 8,
      font: fonts.bold,
      color: MUTED,
    });
    const lines = wrapText(value, fonts.regular, 9, CONTENT_WIDTH - 140);
    lines.forEach((line, i) => {
      if (i > 0) layout.ensure(12);
      layout.page.drawText(toWinAnsi(line), {
        x: MARGIN + 140,
        y: layout.y - 8 - i * 11,
        size: 9,
        font: fonts.regular,
        color: INK,
      });
    });
    layout.y -= Math.max(15, lines.length * 11 + 4);
  };

  section(layout, fonts, 'DOCUMENT');
  field('Title', input.title);
  field('Client', input.clientName);
  field('Request ID', input.requestId);
  field('Document SHA-256', input.documentHash);
  field('Signed PDF SHA-256', input.signedPdfHash);

  section(layout, fonts, 'SIGNER');
  field('Name', input.signerName);
  if (input.signerEmail) field('Email', input.signerEmail);
  if (input.signerPhone) field('Phone', input.signerPhone);
  field('Signer ID', input.signerId);
  field('Method', input.signatureMethod === 'draw' ? 'Drawn signature' : 'Typed signature');
  field('Signed at (UTC)', input.signedAt.toISOString());
  if (input.consentAcceptedAt) {
    field('Consent accepted (UTC)', input.consentAcceptedAt.toISOString());
  }

  section(layout, fonts, 'CONSENT ACCEPTED');
  const consentLines = wrapText(input.consentText, fonts.italic, 9, CONTENT_WIDTH);
  drawLines(layout, consentLines, fonts.italic, 9, 12);
  layout.y -= 8;

  section(layout, fonts, 'EVENT TRAIL');
  for (const event of input.events) {
    layout.ensure(24);
    layout.page.drawText(toWinAnsi(event.event_type), {
      x: MARGIN,
      y: layout.y - 8,
      size: 8,
      font: fonts.bold,
      color: INK,
    });
    layout.page.drawText(toWinAnsi(new Date(event.created_at).toISOString()), {
      x: MARGIN + 170,
      y: layout.y - 8,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
    layout.y -= 11;

    const detail = [
      event.ip_address ? `IP ${event.ip_address}` : null,
      event.channel ? `via ${event.channel}` : null,
      event.user_agent ? event.user_agent.slice(0, 70) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    if (detail) {
      layout.page.drawText(toWinAnsi(detail), {
        x: MARGIN + 8,
        y: layout.y - 7,
        size: 7,
        font: fonts.regular,
        color: MUTED,
      });
      layout.y -= 11;
    }
    layout.y -= 2;
  }

  layout.ensure(40);
  layout.y -= 10;
  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
    thickness: 0.5,
    color: LINE,
  });
  layout.y -= 12;

  const footer = wrapText(
    'This certificate was generated automatically by SmarTrack CRM. All timestamps are UTC. IP addresses and user agents were captured server-side at the moment of each event and were not supplied by the signer. The document hash identifies the exact content presented for signature; any change to that content produces a different hash.',
    fonts.italic,
    7,
    CONTENT_WIDTH
  );
  for (const line of footer) {
    layout.ensure(9);
    layout.page.drawText(toWinAnsi(line), {
      x: MARGIN,
      y: layout.y - 7,
      size: 7,
      font: fonts.italic,
      color: MUTED,
    });
    layout.y -= 9;
  }

  layout.finish();

  const bytes = await doc.save();
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function section(layout: Layout, fonts: Fonts, label: string): void {
  layout.ensure(26);
  layout.y -= 8;
  layout.page.drawText(toWinAnsi(label), {
    x: MARGIN,
    y: layout.y - 8,
    size: 8,
    font: fonts.bold,
    color: rgb(0.15, 0.39, 0.92),
  });
  layout.y -= 16;
}

function formatDateTime(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()} ${hh}:${mi}`;
}
