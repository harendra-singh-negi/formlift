// Text boxes that grow with their answer: a long textarea / checklist answer makes its box taller and pushes
// everything below it on the page down, the same way on screen (FormFiller) and in the completed PDF.
// Units are PDF points, measured from the page's top.
import type { AnswerValue, FieldDef } from './model';
import { answerText } from './values';
import { rowCount } from './rows';

/** Width of `text` at font `size` (points), Helvetica metrics: pdf-lib's font, or a canvas measuring Arial. */
export type WidthOf = (text: string, size: number) => number;

/** Field types whose box grows with a long answer. */
export const GROWING_TYPES: readonly string[] = ['textarea', 'checklist', 'text'];

/** `text` cut into lines no wider than `width` at this size (words kept whole where they fit). */
export function wrapText(text: string, width: number, size: number, widthOf: WidthOf): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, size) <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
      while (widthOf(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && widthOf(line.slice(0, cut), size) > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

/** Font size (points) of an answer in a box `h` points tall: one line (text) fills more of its box. */
export const textSize = (h: number, single = false) => Math.max(5, Math.min(11, h * (single ? 0.7 : 0.35)));

/**
 * An answer in a `w` x `h` box: its font size, its lines and how much taller the box must grow. A one-line box
 * (`single`, a text field) grows only once its text no longer fits on one line, then wraps like a textarea.
 */
export function textFit(text: string, w: number, h: number, widthOf: WidthOf, single = false) {
  const size = textSize(h, single);
  const lines = wrapText(text, w - 4, size, widthOf);
  const need = lines.length * size * 1.2 + size * 0.2 + 2;
  return { size, lines, extra: single && lines.length < 2 ? 0 : Math.max(0, need - h) };
}

/** Where a page grows: [cut (distance from the top), by how much], sorted. */
export type Cut = [at: number, by: number];

/** Boxes ending on the same line share one cut (the larger push). */
export function pageCuts(boxes: { bottom: number; extra: number }[]): Cut[] {
  const cuts = new Map<number, number>();
  for (const b of boxes) {
    if (b.extra <= 0) continue;
    const c = Math.round(b.bottom * 2) / 2;
    cuts.set(c, Math.max(cuts.get(c) ?? 0, b.extra));
  }
  return [...cuts].sort((a, b) => a[0] - b[0]);
}

/** Where a point `d` from the top of the page lands once the page has grown. */
export const movedDown = (d: number, cuts: Cut[]) => d + cuts.reduce((s, [c, e]) => (c < d ? s + e : s), 0);

/**
 * The grown page as pieces of the original: [from, to] (from the top) drawn at `at`, `height` tall. Between pieces,
 * the gap is a thin slice just above the cut stretched down, so a table's vertical borders carry on.
 * ponytail: that slice also smears anything horizontal lying in it (0.5pt high, rare).
 */
function growPieces(height: number, cuts: Cut[]) {
  const pieces: { from: number; to: number; at: number; height: number }[] = [];
  let from = 0;
  let shift = 0;
  for (const [c, e] of cuts) {
    pieces.push({ from, to: c, at: from + shift, height: c - from });
    pieces.push({ from: Math.max(0, c - 1.5), to: Math.max(0.5, c - 1), at: c + shift, height: e });
    from = c;
    shift += e;
  }
  pieces.push({ from, to: height, at: from + shift, height: height - from });
  return pieces.filter((p) => p.to > p.from);
}

/** Room (points) kept at a page's bottom, and at the next page's top, where a grown page runs on: half an inch. */
export const BREAK_MARGIN = 36;

/** One printed page of a grown page: the grown page's [from, to) (from its top), drawn `at` from this page's top. */
export type Sheet = { from: number; to: number; at: number };

/** Where a grown box may break between pages: in the leading above each of its lines, and at its end. */
export const lineGaps = (start: number, size: number, lines: number, end: number) => [
  ...Array.from({ length: lines + 1 }, (_, i) => start + 1 + (i * 1.2 + 0.1) * size),
  end,
];

/**
 * A grown page cut into pages of its own size, BREAK_MARGIN kept at each break (bottom of one, top of the next).
 * A break moves up to the nearest `safe` point (lineGaps) so no line of text is cut in two.
 * ponytail: with no safe point in the lower 3/4 of the room, it cuts the original page's art where it falls.
 */
export function pageSheets(
  height: number,
  cuts: Cut[],
  safe: number[] = [],
  margin = BREAK_MARGIN,
  length = height,
): Sheet[] {
  const end = length + cuts.reduce((s, [, e]) => s + e, 0);
  const out: Sheet[] = [];
  let [from, at] = [0, 0];
  while (end - from > height - at + 1e-6) {
    const room = Math.max(1, height - at - margin);
    const fits = safe.filter((s) => s > from + room / 4 && s <= from + room);
    const to = fits.length ? Math.max(...fits) : from + room;
    out.push({ from, to, at });
    [from, at] = [to, margin];
  }
  out.push({ from, to: end, at });
  return out;
}

/** The sheet a point `d` of the grown page (from its top) prints on. */
export const sheetOf = (d: number, sheets: Sheet[]) => {
  const k = sheets.findIndex((s) => d < s.to);
  return k < 0 ? sheets.length - 1 : k;
};

/** Where a point `d` of the grown page lands from the first sheet's top, sheets `height` tall `gap` apart. */
export function onSheets(d: number, sheets: Sheet[], height: number, gap = 0) {
  const k = sheetOf(d, sheets);
  return k * (height + gap) + sheets[k].at + d - sheets[k].from;
}

/**
 * Added table rows (expandRows): the row's band [at - tile, at] of the page copied `copies` times under it, the
 * rest of the page moved down. The band is the row's fields plus ROW_PAD below (the row's bottom line), so the
 * copies stack line under line.
 * ponytail: a band runs over the row's fields only; a table row much taller than its fields copies part of it.
 */
export type RowCut = { at: number; tile: number; copies: number };
export const ROW_PAD = 2;

/** The page with its added rows (from its top): [from, to] of the original page shown at `at`, same size. */
function rowPieces(height: number, rows: RowCut[]) {
  const out: { from: number; to: number; at: number }[] = [];
  let [from, shift] = [0, 0];
  for (const r of rows) {
    out.push({ from, to: r.at, at: from + shift });
    for (let j = 1; j <= r.copies; j++) out.push({ from: r.at - r.tile, to: r.at, at: r.at + shift + (j - 1) * r.tile });
    shift += r.copies * r.tile;
    from = r.at;
  }
  out.push({ from, to: height, at: from + shift });
  return out.filter((p) => p.to > p.from);
}

/**
 * The grown page laid on its sheets: slices of the original page [from, to] (from its top), each drawn on sheet
 * `sheet`, `at` from its top, `height` tall (taller than the slice where it is stretched). `cuts` are on the page
 * with its added `rows`.
 */
export function sheetPieces(height: number, cuts: Cut[], sheets: Sheet[], rows: RowCut[] = []) {
  const out: { from: number; to: number; sheet: number; at: number; height: number }[] = [];
  const base = rowPieces(height, rows);
  const length = height + rows.reduce((s, r) => s + r.copies * r.tile, 0);
  // Each piece of the grown page is a piece of the page with rows: back to the original page's slices.
  const pieces = growPieces(length, cuts).flatMap((p) => {
    const k = (p.to - p.from) / p.height;
    return base.flatMap((b) => {
      const [a, z] = [Math.max(p.from, b.at), Math.min(p.to, b.at + b.to - b.from)];
      return z > a ? [{ from: b.from + a - b.at, to: b.from + z - b.at, at: p.at + (a - p.from) / k, height: (z - a) / k }] : [];
    });
  });
  for (const p of pieces) {
    const k = (p.to - p.from) / p.height;
    sheets.forEach((s, sheet) => {
      const [a, z] = [Math.max(p.at, s.from), Math.min(p.at + p.height, s.to)];
      if (z > a) out.push({ from: p.from + (a - p.at) * k, to: p.from + (z - p.at) * k, sheet, at: s.at + a - s.from, height: z - a });
    });
  }
  return out;
}

/**
 * One page (`size` in points) for these answers: its added rows, the growing boxes, the cuts they make (on the
 * page with its rows), its sheets, and where things land before the cuts: `toRows(d)` for a point of the original
 * page, `top(f)` for a field (a row copy sits `tile` under the row before it).
 */
export function pageGrowth(
  fields: FieldDef[],
  answers: Record<string, AnswerValue | undefined>,
  page: number,
  size: { width: number; height: number },
  widthOf: WidthOf,
  shown: (f: FieldDef) => boolean = () => true,
) {
  const { width, height } = size;
  const here = fields.filter((f) => f.position.page === page && !f.dialogOnly && shown(f));
  // Added rows: each row's band, from its first row's fields.
  const rows: (RowCut & { id: string })[] = [];
  for (const f of here) {
    const id = f.repeat?.id;
    if (!id || f.repeat!.row || rows.some((r) => r.id === id)) continue;
    const copies = rowCount(fields, id, answers) - 1;
    const row = here.filter((x) => x.repeat?.id === id && !x.repeat.row);
    // From the fields' top (the row's top line stays the row above's) to just past the row's bottom line.
    const top = Math.min(...row.map((x) => x.position.y)) * height;
    const at = Math.max(...row.map((x) => x.position.y + x.position.height)) * height + ROW_PAD;
    if (copies > 0) rows.push({ id, at, tile: at - top, copies });
  }
  rows.sort((a, b) => a.at - b.at);
  const toRows = (d: number) => d + rows.reduce((s, r) => (r.at < d ? s + r.copies * r.tile : s), 0);
  const tile = (id: string) => rows.find((r) => r.id === id)?.tile ?? 0;
  const top = (f: FieldDef) => toRows(f.position.y * height) + ((f.repeat?.row ?? 1) - 1) * tile(f.repeat?.id ?? '');

  const boxes = new Map<string, ReturnType<typeof textFit>>();
  const ends: { bottom: number; extra: number }[] = [];
  for (const f of here) {
    if (!GROWING_TYPES.includes(f.type)) continue;
    const text = answerText(f, answers[f.key]);
    if (!text) continue;
    const fit = textFit(text, f.position.width * width, f.position.height * height, widthOf, f.type === 'text');
    boxes.set(f.key, fit);
    ends.push({ bottom: top(f) + f.position.height * height, extra: fit.extra });
  }
  const cuts = pageCuts(ends);
  const safe: number[] = [];
  for (const f of here) {
    const fit = boxes.get(f.key);
    if (!fit?.extra) continue;
    const start = movedDown(top(f), cuts);
    safe.push(...lineGaps(start, fit.size, fit.lines.length, start + f.position.height * height + fit.extra));
  }
  // A page break between rows rather than through one.
  for (const r of rows)
    for (let j = -1; j <= r.copies; j++) safe.push(movedDown(toRows(r.at) + j * r.tile, cuts));
  const length = toRows(height + 1e-9);
  return { boxes, cuts, rows, top, toRows, sheets: pageSheets(height, cuts, safe, BREAK_MARGIN, length) };
}
