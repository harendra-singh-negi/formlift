// The text of a document's pages as lessons use it: lines, normalised and hashed (a lesson keeps the hashes, never
// the page's text), read once per document.

import { FIELD_TYPES } from '../form-logic'
import { toLines, type PdfTextItem } from '../layout'
import type { Mark } from './lesson'

export const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
/**
 * A label as lessons know it ("Date:" and "DATE" are one), or "" for a label that says nothing about the field:
 * none, no letter in it ("1"), or what auto-detect calls a box it found no label for ("checkbox", "Text").
 */
export const labelKey = (s: string) =>
  (FIELD_TYPES as readonly string[]).includes(s) || s === 'Text' || !/\p{L}/u.test(s)
    ? ''
    : norm(s).replace(/[\s:.*]+$/, '')
export const r4 = (n: number) => Math.round(n * 1e4) / 1e4
export const r1 = (n: number) => Math.round(n * 10) / 10
export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// cyrb53 (public domain): a 53-bit hash.
export function hashOf(s: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
export const hash = (s: string) => hashOf(s).toString(36)
/** A label's hash, as lessons know it. */
export const labelHash = (label: string) => hash(labelKey(label))

/** A line of a page's text (page fractions). Its text stays here: lessons keep only the hash. */
export interface Line {
  h: string
  n: number
  x: number
  y: number
  w: number
  ht: number
  text: string
}
export interface PageText {
  lines: Line[]
  /** Points. */
  width: number
  height: number
}

function pageLines(items: unknown[], view: number[]): Line[] {
  const out: Line[] = []
  for (const l of toLines(items as PdfTextItem[], view)) {
    const t = norm(l.text)
    // Lines on the page (or just off it): text hidden far outside the page is nothing to know it by.
    if (!/[\p{L}\p{N}]/u.test(t) || ![l.x, l.y].every((n) => n > -0.5 && n < 1.5)) continue
    const n = hashOf(t)
    out.push({ h: n.toString(36), n, x: l.x, y: l.y, w: l.width, ht: l.height, text: l.text })
  }
  return out
}
export const mark = (l: Line): Mark => [l.h, r4(l.x), r4(l.y)]

/** What reading a page needs from a pdf.js document (its picture, too, when it has a canvasFactory). */
export interface TextPdf {
  getPage(n: number): Promise<{ view: number[]; getTextContent(): Promise<{ items: unknown[] }> }>
}
// The text of each page, read once per document: the detection and the lessons after it share it.
const read = new WeakMap<object, Map<number, PageText>>()
export async function textOf(pdf: TextPdf, sources: number[]) {
  let known = read.get(pdf)
  if (!known) read.set(pdf, (known = new Map()))
  for (const n of sources)
    if (!known.has(n)) {
      const page = await pdf.getPage(n)
      const v = page.view
      known.set(n, { lines: pageLines((await page.getTextContent()).items, v), width: v[2] - v[0], height: v[3] - v[1] })
    }
  return known
}

/** A page's own lines: those that appear once in the whole document (once on this page, on no other). */
export function ownLines(texts: Map<number, PageText>, sources: number[]) {
  const count = new Map<string, number>()
  for (const n of new Set(sources)) for (const l of texts.get(n)?.lines ?? []) count.set(l.h, (count.get(l.h) ?? 0) + 1)
  return (n: number) => (texts.get(n)?.lines ?? []).filter((l) => count.get(l.h) === 1)
}

/** The lines that appear once on a page, by hash: they tell where a field went. */
export function uniqueOn(lines: Line[]) {
  const count = new Map<string, number>()
  for (const l of lines) count.set(l.h, (count.get(l.h) ?? 0) + 1)
  return new Map(lines.filter((l) => count.get(l.h) === 1).map((l) => [l.h, l]))
}
