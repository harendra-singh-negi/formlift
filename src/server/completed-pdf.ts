import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import { defaultLayout, fieldStates, type Answers, type FieldDef, type Layout, type LayoutElement } from '../core/form-logic';

// The document as users see it, as a new PDF: the layout's pages (original pages copied, blank ones added), the
// admin's text / boxes / lines, then the answers at their fields. The original file stays as it is.
// ponytail: standard PDF fonts (WinAnsi) only, other characters print as '?'; embed a Unicode TTF when non-Latin
// text matters. Rotated original pages (/Rotate) are not handled.

const printable = (font: PDFFont, s: string) =>
  [...s.replace(/\r/g, '')]
    .map((ch) => {
      if (ch === '\n') return ch;
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    })
    .join('');

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const hex = (c: string) =>
  rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);

type Fonts = Record<string, PDFFont>;
async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const F = StandardFonts;
  const names: Record<string, StandardFonts> = {
    sans: F.Helvetica,
    'sans-b': F.HelveticaBold,
    'sans-i': F.HelveticaOblique,
    'sans-bi': F.HelveticaBoldOblique,
    serif: F.TimesRoman,
    'serif-b': F.TimesRomanBold,
    'serif-i': F.TimesRomanItalic,
    'serif-bi': F.TimesRomanBoldItalic,
    mono: F.Courier,
    'mono-b': F.CourierBold,
    'mono-i': F.CourierOblique,
    'mono-bi': F.CourierBoldOblique,
  };
  const out: Fonts = {};
  for (const [k, v] of Object.entries(names)) out[k] = await doc.embedFont(v);
  return out;
}
const fontOf = (fonts: Fonts, e: LayoutElement) =>
  fonts[`${e.font ?? 'sans'}${e.bold || e.italic ? '-' : ''}${e.bold ? 'b' : ''}${e.italic ? 'i' : ''}`];

// A page-fraction box in PDF coordinates (origin bottom left) of the page's visible box.
function boxOn(page: PDFPage, p: { x: number; y: number; width: number; height: number }) {
  const b = page.getCropBox();
  const w = p.width * b.width;
  const h = p.height * b.height;
  return { x: b.x + p.x * b.width, top: b.y + b.height - p.y * b.height, w, h };
}

function drawElement(page: PDFPage, e: LayoutElement, fonts: Fonts) {
  const { x, top, w, h } = boxOn(page, e.position);
  if (e.type === 'line') {
    page.drawLine({
      start: { x, y: top },
      end: { x: x + w, y: top - h },
      thickness: e.strokeWidth ?? 1,
      color: hex(e.stroke ?? '#000000'),
    });
    return;
  }
  if (e.fill || (e.type === 'box' && e.stroke))
    page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      ...(e.fill ? { color: hex(e.fill) } : {}),
      ...(e.stroke && (e.strokeWidth ?? 1) > 0 ? { borderColor: hex(e.stroke), borderWidth: e.strokeWidth ?? 1 } : {}),
    });
  if (e.type !== 'text' || !e.text) return;
  const font = fontOf(fonts, e);
  const size = e.fontSize ?? 10;
  const lineHeight = size * 1.2;
  // Wrap each paragraph to the box width, then align each line.
  const lines: string[] = [];
  for (const para of printable(font, e.text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > w) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  lines.forEach((line, i) => {
    const lw = font.widthOfTextAtSize(line, size);
    const dx = e.align === 'center' ? (w - lw) / 2 : e.align === 'right' ? w - lw : 0;
    page.drawText(line, {
      x: x + dx,
      y: top - size * 0.95 - i * lineHeight,
      size,
      font,
      color: hex(e.color ?? '#000000'),
    });
  });
}

/** A file of the submission (upload or signature PNG), by its id = the answer's value. */
export interface AnswerFile {
  fileName: string;
  fileType: string;
  bytes: Uint8Array;
}

type Embedded = [name: string, spec: PDFRef];

/**
 * An uploaded file inside the PDF under its original name: listed in the viewer's attachments panel, and a click
 * on the field's box opens / saves it (a FileAttachment annotation with an empty look, so the file name drawn in
 * the box shows). Acrobat, Firefox and most desktop readers support this; Chrome's built-in viewer does not.
 */
function embedFile(doc: PDFDocument, page: PDFPage, box: ReturnType<typeof boxOn>, file: AnswerFile, list: Embedded[]) {
  const ctx = doc.context;
  const stream = ctx.register(
    ctx.flateStream(file.bytes, {
      Type: 'EmbeddedFile',
      Subtype: PDFName.of(file.fileType || 'application/octet-stream'),
      Params: { Size: file.bytes.length },
    }),
  );
  const spec = ctx.register(
    ctx.obj({
      Type: 'Filespec',
      F: PDFString.of(file.fileName.replace(/[^\x20-\x7e]/g, '_')),
      UF: PDFHexString.fromText(file.fileName),
      EF: { F: stream, UF: stream },
    }),
  );
  list.push([file.fileName, spec]);
  const { x, top, w, h } = box;
  const look = ctx.register(ctx.formXObject([], { BBox: [0, 0, w, h] }));
  const annot = ctx.obj({
    Type: 'Annot',
    Subtype: 'FileAttachment',
    Rect: [x, top - h, x + w, top],
    FS: spec,
    Contents: PDFHexString.fromText(file.fileName),
    Name: 'Paperclip',
    F: 4, // print
    AP: { N: look },
  });
  page.node.addAnnot(ctx.register(annot));
}

// The document's attachments list (catalog /Names /EmbeddedFiles), sorted by name as the PDF spec asks;
// files the original PDF already carried stay listed.
function listAttachments(doc: PDFDocument, list: Embedded[]) {
  if (!list.length) return;
  const ctx = doc.context;
  const seen = new Map<string, number>();
  const entries = list.map(([name, spec]) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return [n > 1 ? `${name} (${n})` : name, spec] as const;
  });
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict) ?? ctx.obj({});
  doc.catalog.set(PDFName.of('Names'), names);
  const earlier = names.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict)?.lookupMaybe(PDFName.of('Names'), PDFArray);
  const flat = earlier ? earlier.asArray() : [];
  names.set(
    PDFName.of('EmbeddedFiles'),
    ctx.obj({ Names: [...flat, ...entries.flatMap(([n, ref]) => [PDFHexString.fromText(n), ref])] }),
  );
}

/**
 * The filled document as a new PDF: layout pages, the admin's text / boxes / lines, then each visible answer at
 * its field. `files` maps an answer's file id (file / signature fields) to its bytes. Runs in Node and browsers.
 */
export async function completedPdf(
  original: Uint8Array | ArrayBuffer,
  fields: FieldDef[],
  answers: Answers,
  files: Record<string, AnswerFile> = {},
  layout: Layout | null = null,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(original, { updateMetadata: false });
  const plan = layout ?? defaultLayout(src.getPages().map((p) => p.getSize()));
  const doc = layout ? await PDFDocument.create() : src;
  if (layout) {
    // Pages in the layout's order; an original page may appear more than once.
    const copied = await doc.copyPages(
      src,
      plan.pages.filter((p) => p.source != null).map((p) => p.source! - 1),
    );
    let next = 0;
    for (const p of plan.pages) doc.addPage(p.source != null ? copied[next++] : [p.width, p.height]);
  }
  const pages = doc.getPages();
  const fonts = await loadFonts(doc);
  for (const e of plan.elements) if (pages[e.page - 1]) drawElement(pages[e.page - 1], e, fonts);

  const font = fonts.sans;
  const states = fieldStates(fields, answers);
  const embedded: Embedded[] = [];
  for (const f of fields) {
    const v = answers[f.key];
    if (!states[f.key]?.visible || v == null || v === '' || v === false) continue;
    const page = pages[f.position.page - 1];
    if (!page) continue;
    const { x, top, w, h } = boxOn(page, f.position);

    if (f.type === 'signature' && typeof v === 'string') {
      // A stored PNG file; signatures saved before files were used are data URLs.
      const png = v.startsWith('data:') ? fromBase64(v.split(',')[1] ?? '') : files[v]?.bytes;
      if (!png) continue;
      const img = await doc.embedPng(png);
      const s = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x, y: top - h + (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
      continue;
    }
    const file = f.type === 'file' ? files[String(v)] : undefined;
    if (file) embedFile(doc, page, { x, top, w, h }, file, embedded);
    const text = f.type === 'checkbox' ? 'X' : f.type === 'file' ? (file?.fileName ?? '') : String(v);
    const multiline = f.type === 'textarea';
    const size = Math.max(5, Math.min(11, h * (multiline ? 0.35 : 0.7)));
    page.drawText(printable(font, text), {
      x: x + 2,
      y: multiline ? top - size - 1 : top - h / 2 - size * 0.35,
      size,
      font,
      color: rgb(0.05, 0.15, 0.45),
      ...(multiline ? { maxWidth: w - 4, lineHeight: size * 1.2 } : {}),
    });
  }
  listAttachments(doc, embedded);
  return doc.save();
}
