// A page's text and fields as pieces: the items of one line (words with their look, fields, small pictures), and
// the markers and blanks that tell a list item or an answer place.

import type { FieldDef } from '../form-logic'
import type { FlowPart, FlowRun } from './types'

export interface Item {
  part: FlowPart
  x: number
  w: number
  base: number
  top: number
  pt: number
}
export interface Piece {
  /** Its parts, each with where it starts and ends on the line. */
  parts: { part: FlowPart; pt: number; x: number; end: number }[]
  x: number
  end: number
  base: number
  top: number
  pt: number
}
export const isText = (p: FlowPart): p is FlowRun => 'text' in p
export const textOf = (p: Piece) =>
  p.parts
    .map((x) => (isText(x.part) ? x.part.text : ''))
    .join('')
    .trim()
export const plain = (p: Piece) => p.parts.every((x) => isText(x.part))
export const round = (n: number) => Math.round(n * 100) / 100

// Boxes typed as text ("☐") and answer blanks ("____", "……", ".....") where a field sits: the field takes their place.
export const BOX = /[\u2610-\u2612\u25A1\u25A2\u25FB\u25FD\u274F-\u2752]/gu
export const BLANK = /_{2,}|…+|\.{3,}/g
// A line starting a new paragraph: "1) ", "a. ", "(iv) ", "A1. ", "3.2.2 ", "-", "•" (or a symbol font's bullet).
export const MARKER = /^(\(?\d{1,2}[.)]\s|\(?[a-z][.)]\s|\(?[ivx]{1,4}\)\s|[A-Z]\d{0,2}\.\s|\d+(\.\d+)+\s|[-–•●▪◦*\p{Co}])/u
// A list marker with nothing after it: "16.", "(b)", "•".
export const LONE = /^(\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivx]{1,4}\)|[-–•●▪◦*\p{Co}])$/u

export const round4 = (n: number) => Math.round(n * 10000) / 10000

export type FieldPart = Extract<FlowPart, { field: FieldDef }>

// Lines: items on one baseline, split where a wide gap starts another column. A field or a small picture sits on
// the line of text its box overlaps (an answer line drawn just under its label's baseline, an icon in the text);
// a picture taller than a few lines is a block of its own.
export function piecesOf(items: Item[]): Piece[] {
  const texts = items.filter((i) => isText(i.part))
  const placed = items.map((it) => {
    if (isText(it.part) || ('image' in it.part && it.base - it.top > 2.5 * it.pt)) return it
    const over = (t: Item) => Math.min(it.base, t.base + 0.25 * t.pt) - Math.max(it.top, t.base - 0.8 * t.pt)
    let best: Item | undefined
    for (const t of texts) if (over(t) > 0.3 * t.pt && (!best || over(t) > over(best))) best = t
    return best ? { ...it, base: best.base } : it
  })
  placed.sort((a, b) => a.base - b.base)
  const rows: Item[][] = []
  for (const it of placed) {
    const row = rows.at(-1)
    if (row && Math.abs(it.base - row[0].base) < 0.4 * Math.max(it.pt, row[0].pt)) row.push(it)
    else rows.push([it])
  }
  const out: Piece[] = []
  for (const row of rows) {
    // A field drawn around text on its line (an answer line under "Comments:") comes after that text.
    const at = (it: Item) =>
      isText(it.part)
        ? it.x
        : Math.max(it.x, ...row.filter((t) => isText(t.part) && t.x > it.x && t.x < it.x + it.w).map((t) => t.x + t.w))
    let last: Piece | undefined
    for (const it of row.sort((a, b) => at(a) - at(b))) {
      const gap = last ? it.x - last.end : Infinity
      const words = isText(it.part) && !!last && isText(last.parts[last.parts.length - 1].part)
      const part = { part: it.part, pt: it.pt, x: it.x, end: it.x + it.w }
      if (last && gap < (words ? 1.5 : 2.5) * Math.max(it.pt, last.pt)) {
        if (isText(it.part) && gap > 0.15 * it.pt && !/\s$/.test(textOf(last)))
          part.part = { ...it.part, text: ` ${it.part.text.trimStart()}` }
        last.parts.push(part)
        last.end = Math.max(last.end, it.x + it.w)
        last.top = Math.min(last.top, it.top)
      } else out.push((last = { parts: [part], x: it.x, end: it.x + it.w, base: it.base, top: it.top, pt: it.pt }))
    }
  }
  return out
}
