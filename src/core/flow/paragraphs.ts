// Lines into paragraphs: lines carried on join one paragraph, and a line with fields or several things side by
// side is laid out by position (its cells).

import { type FieldPart, isText, LONE, MARKER, type Piece, plain, round, textOf } from './pieces'
import { lum } from './read'
import type { FlowCell, FlowPara, FlowPart, FlowRun } from './types'

// A line of the page laid out by position: each of its paragraphs, and on a line with fields each run of text and
// each field, at its place in % of the page's content (`left`, `span`). Text has the room up to what comes next;
// a field is as wide as on the page. A field with no text on either side (a row of answer lines under column
// names) is captioned with its label, shown where the line wraps.
export function lineCells(row: { ps: Piece[]; para: FlowPara }[], left: number, span: number, body: number): FlowCell[] {
  const slots: { x0: number; x1: number; para: FlowPara; field?: FieldPart }[] = []
  const x = (r: (typeof row)[number]) => Math.min(...r.ps.map((p) => p.x))
  // Paragraphs left to right; within a line its own order (a field around its label's text comes after it).
  for (const { ps, para } of [...row].sort((a, b) => x(a) - x(b))) {
    if (ps.length > 1 || !ps[0].parts.some((p) => 'field' in p.part)) {
      const x0 = Math.min(...ps.map((p) => p.x))
      slots.push({ x0, x1: Math.max(...ps.map((p) => p.end)), para: { parts: para.parts, size: para.size } })
      continue
    }
    let run: Piece['parts'] = []
    const flush = () => {
      if (!run.length) return
      const piece = { ...ps[0], parts: run, x: run[0].x, end: Math.max(...run.map((r) => r.end)) }
      slots.push({ x0: piece.x, x1: piece.end, para: finish([piece], piece.x, piece.end, body, '#ffffff') })
      run = []
    }
    for (const p of ps[0].parts)
      if ('field' in p.part) {
        flush()
        slots.push({ x0: p.x, x1: p.end, para: { parts: [p.part], size: 1 }, field: p.part })
      } else run.push(p)
    flush()
  }
  const text = (k: number) => !!slots[k] && !slots[k].field
  let end = left
  return slots.map((s, k) => {
    const x0 = Math.max(s.x0, end)
    const x1 = Math.max(x0 + 1, s.field ? s.x1 : Math.max(s.x1, slots[k + 1]?.x0 ?? left + span))
    const para = s.field && !text(k - 1) && !text(k + 1) ? { parts: [{ ...s.field, caption: true }], size: 1 } : s.para
    const cell = { width: round((100 * (x1 - x0)) / span), offset: round((100 * (x0 - end)) / span), paras: [para] }
    end = x1
    return cell
  })
}

// Lines carried on join one paragraph: the next line starts in lower case, or this one ran to the right edge
// mid-sentence; a list marker, a size change, a gap or a field starts a new one. A line joins the paragraph whose
// last line is right above it (two columns of text side by side stay apart), under its start or, after a list
// marker, under the item's text ("15. Training …" / "    identification …").
export function paragraphs(pieces: Piece[], left: number, right: number, body: number, fill = '#ffffff') {
  const groups: Piece[][] = []
  for (const c of pieces) {
    const t = textOf(c)
    let into: Piece[] | undefined
    if (plain(c) && !MARKER.test(t))
      for (let g = groups.length - 1; g >= Math.max(0, groups.length - 6) && !into; g--) {
        const p = groups[g][groups[g].length - 1]
        if (
          plain(p) &&
          c.base - p.base > 0.4 * p.pt &&
          c.base - p.base < 1.7 * Math.max(p.pt, c.pt) &&
          Math.abs(c.pt - p.pt) < 0.15 * p.pt &&
          c.x - p.x < (MARKER.test(textOf(p)) ? 6 : 2) * p.pt &&
          c.x < p.end &&
          c.end > p.x &&
          (/^\p{Ll}/u.test(t) || (p.end > right - 2.5 * p.pt && !/[.:;?!]$/.test(textOf(p))))
        )
          into = groups[g]
      }
    if (into) into.push(c)
    else groups.push([c])
  }
  // A list marker alone on its line ("16." centred on its item's lines, in a column of its own) starts the
  // paragraph right beside it.
  for (let g = groups.length - 1; g >= 0; g--) {
    const [m] = groups[g]
    if (groups[g].length > 1 || !plain(m) || !LONE.test(textOf(m))) continue
    const into = groups.find(
      (o) => o !== groups[g] && o[0].x > m.x && o[0].x - m.end < 6 * m.pt && o[0].top < m.base && o.at(-1)!.base > m.top,
    )
    if (!into) continue
    const [first, ...rest] = into[0].parts
    const lead = isText(first.part) ? { ...first, part: { ...first.part, text: ` ${first.part.text.trimStart()}` } } : first
    into[0] = { ...into[0], x: m.x, parts: [...m.parts, lead, ...rest] }
    groups.splice(g, 1)
  }
  return groups.map((ps) => ({
    ps,
    para: finish(ps, left, right, body, fill),
    top: Math.min(...ps.map((p) => p.top)),
    bottom: ps[ps.length - 1].base + 0.25 * ps[ps.length - 1].pt,
    base: ps[0].base,
    pt: ps[0].pt,
  }))
}

export const sameLook = (a: FlowRun, b: FlowRun) =>
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.font === b.font &&
  a.color === b.color &&
  a.bg === b.bg &&
  a.size === b.size

export function finish(ps: Piece[], left: number, right: number, body: number, fill: string): FlowPara {
  const sizes = ps.flatMap((p) => p.parts.filter((x) => isText(x.part)).map((x) => x.pt))
  const pt = sizes.length ? Math.max(...sizes) : body
  const parts: FlowPart[] = []
  ps.forEach((p, i) =>
    p.parts.forEach(({ part, pt: size }, j) => {
      if (!isText(part)) return void parts.push(part)
      const run: FlowRun = { ...part, text: part.text.replace(/\p{Co}/gu, '•') }
      // The lines of a paragraph join with a space; a word hyphenated at the line's end joins without one.
      if (i > 0 && j === 0) run.text = (/\p{L}-$/u.test(textOf(ps[i - 1])) ? '' : ' ') + run.text.trimStart()
      // White text on a white page (its dark bar not found): drawn in the normal ink.
      if (run.color && Math.abs(lum(run.color) - lum(run.bg ?? fill)) < 0.25) delete run.color
      if (Math.abs(size / pt - 1) > 0.1) run.size = round(size / pt)
      // The space before underlined or highlighted words is not part of them.
      const lead = /^\s+/.exec(run.text)?.[0]
      if (lead && (run.underline || run.bg)) {
        run.text = run.text.slice(lead.length)
        const prev = parts[parts.length - 1]
        if (prev && isText(prev) && !prev.underline && !prev.bg) prev.text += lead
        else parts.push({ text: lead })
      }
      const last = parts[parts.length - 1]
      if (last && isText(last) && sameLook(last, run)) last.text += run.text
      else parts.push(run)
    }),
  )
  const first = parts[0]
  if (first && isText(first)) first.text = first.text.trimStart()
  // Centred or right-aligned as on the page: every line's gaps to the box's edges say so (an indented line of a
  // justified paragraph, gaps 35 and 3, is neither).
  const gaps = ps.map((p) => [p.x - left, right - p.end])
  const width = right - left
  const align =
    width > 4 * pt &&
    gaps.every(([l, r]) => l > 2 * pt && Math.abs(l - r) < Math.max(3, Math.min(0.08 * width, 0.3 * Math.max(l, r))))
      ? 'center'
      : gaps.every(([l, r]) => r < 1.5 * pt && l > Math.max(2 * pt, 0.15 * width))
        ? 'right'
        : undefined
  return { parts, size: round(pt / body), ...(align && { align }) }
}
