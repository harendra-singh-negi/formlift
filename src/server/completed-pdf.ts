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
import {
  answerText,
  defaultLayout,
  fileIds,
  perRowOf,
  fieldStates,
  type Answers,
  type AnswerValue,
  type Comments,
  type FieldDef,
  type Layout,
  type LayoutElement,
} from '../core/form-logic';
import { movedDown, pageGrowth, sheetOf, sheetPieces, textSize, wrapText, type WidthOf } from '../core/form-logic/grow';
import { expandRows } from '../core/form-logic/rows';

/** Options of completedPdf. */
export interface CompletedPdfOptions {
  /** Comments to print on the "Comments" pages (fields with `comments: true`). */
  comments?: Comments;
  /** Headings and words of the added pages (any language). */
  text?: Partial<typeof APPENDIX_TEXT>;
  /**
   * The original PDF's text lines per page (page fractions; `pdfTextLines` from formlift/react reads them): the
   * room a growing answer makes is then not made from the text beside it. Without it that text may look smeared.
   */
  textLines?: Record<number, { y: number; height: number }[]>;
}

const APPENDIX_TEXT = {
  moreAnswers: 'Additional answers',
  comments: 'Comments',
  attachedFiles: 'Attached files',
  page: (n: number) => `page ${n}`,
  yes: 'Yes',
  no: 'No',
};

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

const wrap = (font: PDFFont, text: string, size: number, width: number) =>
  wrapText(text, width, size, (t, n) => font.widthOfTextAtSize(t, n));

type Block = { heading?: string; lines: string[] };

/** A4 pages at the end with headed blocks of text: follow-up answers and comments that have no box on a page. */
/**
 * The original's own fillable fields, printed as they look and then removed: left in, an empty field sits on top of
 * the answer printed in its place (and some viewers paint it over the answer). A field pdf-lib cannot print (no
 * appearance) is just removed.
 */
function printOwnFields(doc: PDFDocument) {
  try {
    doc.getForm().flatten({ updateFieldAppearances: false });
  } catch {
    // Removed below, with whatever flatten left.
  }
  doc.catalog.delete(PDFName.of('AcroForm'));
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    for (let i = (annots?.size() ?? 0) - 1; i >= 0; i--) {
      const a = annots!.lookup(i); // undefined: a field flatten already deleted
      if (!(a instanceof PDFDict) || a.get(PDFName.of('Subtype')) === PDFName.of('Widget')) annots!.remove(i);
    }
  }
}

function appendPages(doc: PDFDocument, fonts: Fonts, title: string, blocks: Block[]) {
  if (!blocks.length) return;
  const [W, H, M] = [595, 842, 50];
  let page = doc.addPage([W, H]);
  let y = H - M;
  const line = (text: string, font: PDFFont, size: number, gap = 4, indent = 0) => {
    for (const l of wrap(font, printable(font, text), size, W - 2 * M - indent)) {
      if (y - size < M) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      page.drawText(l, { x: M + indent, y: y - size, size, font, color: rgb(0.12, 0.16, 0.22) });
      y -= size + gap;
    }
  };
  line(title, fonts['sans-b'], 16, 12);
  for (const b of blocks) {
    y -= 6;
    if (b.heading) line(b.heading, fonts['sans-b'], 11, 5);
    for (const l of b.lines) line(l, fonts.sans, 10, 4, 10);
  }
}

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

type Growth = ReturnType<typeof pageGrowth>;
type Box = { x: number; top: number; w: number; h: number };
type DrawAnswer = (page: PDFPage, f: FieldDef, v: AnswerValue, box: Box) => Promise<void>;

/**
 * Page `index` rebuilt as it grows (core/form-logic/grow.ts, as on screen): added table rows copied under their
 * row, and everything below an overflowing text box moved down by what the text needs, onto added pages of the
 * same size when it runs off the end, with BREAK_MARGIN kept at the bottom and top of each break and no line of an
 * answer cut in two (pageSheets). The page's answers are drawn here, after it is rebuilt (drawn before, the first
 * row's answers would be copied into the added rows).
 * ponytail: links / file annotations of a rebuilt page are dropped. Boxes side by side with different bottoms cut
 * each other's row.
 */
async function pushDown(
  doc: PDFDocument,
  index: number,
  g: Growth,
  items: { f: FieldDef; v: AnswerValue }[],
  draw: DrawAnswer,
  font: PDFFont,
) {
  const old = doc.getPage(index);
  old.pushOperators(); // a blank page has no Contents, which embedPage refuses
  const b = old.getCropBox();
  const [W, H, top] = [b.width, b.height, b.y + b.height];
  const { cuts, sheets } = g;
  const pages = sheets.map((_, k) => doc.insertPage(index + 1 + k, [W, H]));
  for (const p of sheetPieces(H, cuts, sheets, g.rows)) {
    const art = await doc.embedPage(old, { left: b.x, right: b.x + W, bottom: top - p.to, top: top - p.from });
    pages[p.sheet].drawPage(art, { x: 0, y: H - p.at - p.height, width: W, height: p.height });
  }
  for (const { f, v } of items) {
    const [x, w, h] = [f.position.x * W, f.position.width * W, f.position.height * H];
    const start = movedDown(g.top(f), cuts);
    const fit = g.boxes.get(f.key);
    if (!fit?.extra) {
      const s = sheets[sheetOf(start + 0.5, sheets)];
      await draw(pages[sheets.indexOf(s)], f, v, { x, top: H - (s.at + start - s.from), w, h });
      continue;
    }
    if (f.type === 'file') {
      // Several files over rows (fileRows): each row drawn on the sheet it starts on.
      for (const [n, row] of fit.lines.entries()) {
        const at = start + n * h;
        const k = sheetOf(at + 0.5, sheets);
        const s = sheets[k];
        await draw(pages[k], f, row, { x, top: H - (s.at + at - s.from), w, h });
      }
      continue;
    }
    const end = start + h + fit.extra;
    // The grown box cleared first: the form's own ruled / dotted lines would run through the text.
    sheets.forEach((s, k) => {
      const [a, z] = [Math.max(start, s.from), Math.min(end, s.to)];
      if (z - a > 2) pages[k].drawRectangle({ x: x + 1, y: H - (s.at + z - s.from) + 1, width: w - 2, height: z - a - 2, color: rgb(1, 1, 1) });
    });
    fit.lines.forEach((line, n) => {
      const base = start + fit.size + 1 + n * fit.size * 1.2; // baseline, from the grown page's top
      const k = sheetOf(base - fit.size * 0.8, sheets); // the sheet the line's top is on (just under its gap)
      const s = sheets[k];
      pages[k].drawText(printable(font, line), { x: x + 2, y: H - (s.at + base - s.from), size: fit.size, font, color: rgb(0.075, 0.306, 0.29) });
    });
  }
  doc.removePage(index);
}


/** A file that is not a photo, in its cell: a frame and its name over up to 3 lines (cut short after that). */
function drawTile(page: PDFPage, { x, top, w, h }: { x: number; top: number; w: number; h: number }, name: string, font: PDFFont) {
  const pad = Math.min(3, w / 20, h / 20);
  page.drawRectangle({ x: x + pad, y: top - h + pad, width: w - 2 * pad, height: h - 2 * pad, borderColor: rgb(0.6, 0.7, 0.7), borderWidth: 0.5, color: rgb(0.96, 0.98, 0.98) });
  const size = Math.max(4, Math.min(8, h / 5));
  const text = printable(font, name);
  let lines = wrapText(text.replace(/([._-])/g, '$1 '), w - 4 * pad - 2, size, (t, n) => font.widthOfTextAtSize(t, n)).map((l) => l.replace(/([._-]) /g, '$1'));
  const most = Math.min(3, Math.max(1, Math.floor((h - 2 * pad) / (size * 1.2))));
  if (lines.length > most) lines = [...lines.slice(0, most - 1), `${lines[most - 1].slice(0, -3)}...`];
  const start = top - h / 2 + ((lines.length - 1) * size * 1.2) / 2 - size * 0.35;
  lines.forEach((l, n) => page.drawText(l, { x: x + 2 * pad + 1, y: start - n * size * 1.2, size, font, color: rgb(0.075, 0.306, 0.29) }));
}

/** An attached photo, whole, as big as fits in its cell and centred. False when the file is not a PNG / JPEG. */
async function drawPhoto(doc: PDFDocument, page: PDFPage, { x, top, w, h }: { x: number; top: number; w: number; h: number }, file: AnswerFile) {
  const b = file.bytes;
  const png = b[0] === 0x89 && b[1] === 0x50;
  const jpg = b[0] === 0xff && b[1] === 0xd8;
  if (!png && !jpg) return false;
  const img = png ? await doc.embedPng(b) : await doc.embedJpg(b);
  const pad = Math.min(2, w / 20, h / 20);
  const s = Math.min((w - 2 * pad) / img.width, (h - 2 * pad) / img.height);
  page.drawImage(img, {
    x: x + (w - img.width * s) / 2,
    y: top - h + (h - img.height * s) / 2,
    width: img.width * s,
    height: img.height * s,
  });
  return true;
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
  form: FieldDef[],
  answers: Answers,
  files: Record<string, AnswerFile> = {},
  layout: Layout | null = null,
  options: CompletedPdfOptions = {},
): Promise<Uint8Array> {
  const T = { ...APPENDIX_TEXT, ...options.text };
  const src = await PDFDocument.load(original, { updateMetadata: false });
  printOwnFields(src);
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
  const fields = expandRows(form, answers); // with the table rows the person added
  const states = fieldStates(fields, answers);
  const embedded: Embedded[] = [];
  const widthOf: WidthOf = (t, n) => font.widthOfTextAtSize(printable(font, t), n);
  const growth = pages.map((p, i) => {
    const { width, height } = p.getCropBox();
    const source = layout ? layout.pages[i]?.source : i + 1;
    const text = source ? (options.textLines?.[source] ?? []) : [];
    return pageGrowth(fields, answers, i + 1, { width, height }, widthOf, (f) => !!states[f.key]?.visible, text);
  });
  const draw: DrawAnswer = async (page, f, v, { x, top, w, h }) => {
    if (f.type === 'signature' && typeof v === 'string') {
      // A stored PNG file; signatures saved before files were used are data URLs.
      const png = v.startsWith('data:') ? fromBase64(v.split(',')[1] ?? '') : files[v]?.bytes;
      if (!png) return;
      const img = await doc.embedPng(png);
      const s = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x, y: top - h + (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
      return;
    }
    // Every file attached; with photosPerRow, the photos drawn side by side, each in a cell of w / photosPerRow.
    const own = f.type === 'file' ? fileIds(v).flatMap((id) => (files[id] ? [files[id]] : [])) : [];
    const per = perRowOf(f);
    const cell = (i: number) => ({ x: x + (w / (per || own.length)) * i, top, w: w / (per || own.length), h });
    own.forEach((file, i) => embedFile(doc, page, cell(i), file, embedded));
    if (own.length && per) {
      // A photo where it is one (PNG / JPEG), else a tile with the file's name: every file has its cell.
      for (const [i, file] of own.slice(0, per).entries())
        if (!(await drawPhoto(doc, page, cell(i), file))) drawTile(page, cell(i), file.fileName, font);
      return;
    }
    const text = f.type === 'checkbox' ? 'X' : f.type === 'file' ? own.map((x) => x.fileName).join(', ') : answerText(f, v);
    const multiline = f.type === 'textarea' || f.type === 'checklist';
    const size = textSize(h, !multiline);
    page.drawText(printable(font, text), {
      x: x + 2,
      y: multiline ? top - size - 1 : top - h / 2 - size * 0.35,
      size,
      font,
      color: rgb(0.075, 0.306, 0.29),
      ...(multiline ? { maxWidth: w - 4, lineHeight: size * 1.2 } : {}),
    });
  };
  // Pages that grow (added rows, long answers) get their answers once rebuilt; the others right here.
  const late: { f: FieldDef; v: AnswerValue }[][] = pages.map(() => []);
  for (const f of fields) {
    const v = answers[f.key];
    if (f.dialogOnly || !states[f.key]?.visible || v == null || v === '' || v === false) continue;
    const i = f.position.page - 1;
    if (!pages[i]) continue;
    if (growth[i].cuts.length || growth[i].rows.length) late[i].push({ f, v });
    else await draw(pages[i], f, v, boxOn(pages[i], f.position));
  }
  for (let i = pages.length - 1; i >= 0; i--)
    if (growth[i].cuts.length || growth[i].rows.length) await pushDown(doc, i, growth[i], late[i], draw, font);
  // Answers asked in dialogs have no box on a page: they go on pages at the end, under the field that asked them.
  const name = (f: FieldDef) => `${f.label || f.key} (${T.page(f.position.page)})`;
  const answered = (f: FieldDef) => states[f.key]?.visible && answers[f.key] != null && answers[f.key] !== '';
  const said = (f: FieldDef) =>
    `${f.label || f.key}: ${f.type === 'file' ? fileIds(answers[f.key]).map((id) => files[id]?.fileName ?? '').filter(Boolean).join(', ') : answerText(f, answers[f.key], T.yes, T.no)}`;
  const asked = new Set<string>();
  const blocks: Block[] = [];
  for (const t of fields) {
    const qs = (t.followUp?.fields ?? [])
      .map((k) => fields.find((f) => f.key === k))
      .filter((f): f is FieldDef => !!f && f.type !== 'signature' && !!answered(f));
    t.followUp?.fields.forEach((k) => asked.add(k));
    if (qs.length) blocks.push({ heading: name(t), lines: qs.map(said) });
  }
  const loose = fields.filter((f) => f.dialogOnly && !asked.has(f.key) && f.type !== 'signature' && answered(f));
  if (loose.length) blocks.push({ lines: loose.map(said) });
  appendPages(doc, fonts, T.moreAnswers, blocks);

  const notes = fields
    .filter((f) => f.comments && options.comments?.[f.key]?.length)
    .map((f) => ({
      heading: name(f),
      lines: options.comments![f.key].map((c) => `${[c.by, c.at.slice(0, 16).replace('T', ' ')].filter(Boolean).join(', ')}: ${c.text}`),
    }));
  appendPages(doc, fonts, T.comments, notes);

  // Every attached file by its field, at the end: readers whose viewer shows no attachments panel see them here.
  const attached = fields
    .filter((f) => f.type === 'file' && answered(f))
    .map((f) => ({ heading: name(f), lines: fileIds(answers[f.key]).flatMap((id) => (files[id] ? [files[id].fileName] : [])) }))
    .filter((b) => b.lines.length);
  appendPages(doc, fonts, T.attachedFiles, attached);

  listAttachments(doc, embedded);
  return doc.save();
}
