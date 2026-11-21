// The printed serial of a repeatable row ("10.", "(c)", "iv)"): found in the page's text when the row is made, and
// counted on in the rows people add (11., (d), v)), on screen, in the list and in the completed PDF.
import type { FieldDef, Position, RowSerial } from './model';

type Line = { text: string; x: number; y: number; width: number; height: number; fontSize: number };

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];
const toRoman = (n: number) => ROMAN.reduce((s, [v, r]) => { for (; n >= v; n -= v) s += r; return s; }, '');
/** A lower-case roman numeral's value, 0 when it is not one (written the usual way). */
function fromRoman(t: string) {
  let [n, rest] = [0, t];
  for (const [v, r] of ROMAN) while (rest.startsWith(r)) [n, rest] = [n + v, rest.slice(r.length)];
  return !rest && n && toRoman(n) === t ? n : 0;
}
/** a…z, then aa, ab… (as spreadsheet columns). */
const toAlpha = (n: number): string => (n > 26 ? toAlpha(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(97 + ((n - 1) % 26));

/** A row's serial in row `k` (1 = as printed). */
export function serialText(s: RowSerial, k: number): string {
  const n = s.start + k - 1;
  const v = s.style === '1' ? String(n) : s.style === 'a' || s.style === 'A' ? toAlpha(n) : toRoman(n);
  return s.before + (s.style === 'A' || s.style === 'I' ? v.toUpperCase() : v) + s.after;
}

type Parsed = Pick<RowSerial, 'start' | 'style' | 'before' | 'after'>;

/**
 * The serial in `text` ("10.", "(c)", "iv)", "B:"), or null. A lone i / v / x / l / c / d / m is roman or a letter
 * by the serial above it (`prev`: "h" → the letter i, "iv" → roman v); with none, "i" is roman and the others
 * letters. Roman numerals with nothing above count up to 40 only ("MI" is more likely a word).
 */
export function parseSerial(text: string, prev?: string): Parsed | null {
  const m = /^([(\[]?)\s*([0-9]{1,4}|[a-z]{1,8}|[A-Z]{1,8})\s*([.)\]:]?)$/.exec(text.trim());
  if (!m) return null;
  const [, before, v, after] = m;
  if (/^[0-9]/.test(v)) return { start: Number(v), style: '1', before, after };
  const upper = v === v.toUpperCase();
  const t = v.toLowerCase();
  const roman = fromRoman(t);
  const above = prev ? parseSerial(prev) : null;
  const aboveRoman = prev ? fromRoman(prev.trim().replace(/^[(\[]|[.)\]:]$/g, '').toLowerCase()) : 0;
  const asRoman = { start: roman, style: upper ? 'I' : 'i', before, after } as const;
  const asAlpha = { start: t.charCodeAt(0) - 96, style: upper ? 'A' : 'a', before, after } as const;
  if (t.length === 1) {
    if (roman && aboveRoman && aboveRoman === roman - 1) return asRoman;
    if (above && (above.style === 'a' || above.style === 'A') && above.start === asAlpha.start - 1) return asAlpha;
    return t === 'i' ? asRoman : asAlpha;
  }
  if (!roman) return null; // a word ("No", "Rs")
  return (aboveRoman && aboveRoman === roman - 1) || roman <= 40 ? asRoman : null;
}

/**
 * The serial printed in a row, from the page's text lines (page fractions): the row's leftmost text beside its
 * fields (in none of them), when it is a serial. With a serial right above it in its column ("9." over "10."), that
 * one must be the one before; an amount ("1800") or a Y / N column does not count on like that.
 */
export function findSerial(row: Pick<Position, 'x' | 'y' | 'width' | 'height'>[], lines: Line[]): RowSerial | null {
  if (!row.length) return null;
  const top = Math.min(...row.map((p) => p.y));
  const bottom = Math.max(...row.map((p) => p.y + p.height));
  const inField = (l: Line) => row.some((p) => l.x < p.x + p.width && l.x + l.width > p.x);
  const l = lines
    .filter((l) => l.y + l.height / 2 > top && l.y + l.height / 2 < bottom && !inField(l))
    .sort((a, b) => a.x - b.x)[0];
  if (!l) return null;
  const prev = lines
    .filter((u) => u.y + u.height <= l.y + 0.002 && l.y - u.y < 3 * (bottom - top) && u.x < l.x + l.width && u.x + u.width > l.x)
    .sort((a, b) => b.y - a.y)[0]?.text;
  const s = parseSerial(l.text, prev);
  const before = prev ? parseSerial(prev) : null;
  if (!s || (before && serialText({ ...s, x: 0, y: 0, width: 0, height: 0, size: 0 }, 0) !== prev!.trim())) return null;
  return { x: l.x, y: l.y, width: l.width, height: l.height, size: l.fontSize, ...s };
}

/** The serials to write over the added rows of these (expanded) fields: copy k of each row whose serial counts or is blanked. */
export function serialBoxes(fields: FieldDef[]): { id: string; k: number; page: number; serial: RowSerial; text: string }[] {
  const out: { id: string; k: number; page: number; serial: RowSerial; text: string }[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    const r = f.repeat;
    const s = r?.serial;
    if (!r?.row || !s || s.mode === 'keep' || seen.has(`${r.id}:${r.row}`)) continue;
    seen.add(`${r.id}:${r.row}`);
    out.push({ id: r.id, k: r.row, page: f.position.page, serial: s, text: s.mode === 'blank' ? '' : serialText(s, r.row) });
  }
  return out;
}

/** A serial box as a field-like thing for pageGrowth's `top` (where copy k of its row sits). */
export const serialSpot = (b: { id: string; k: number; page: number; serial: RowSerial }) =>
  ({ position: { page: b.page, ...b.serial }, repeat: { id: b.id, row: b.k } }) as unknown as FieldDef;
