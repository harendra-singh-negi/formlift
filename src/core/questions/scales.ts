// Scales: questions answered with the same choices ("Satisfactory / Not satisfactory") written once over them.

import type { TextLine } from '../layout'
import { choicesOf } from './answers'
import { norm, type PageText, type Question, top } from './question'

// Letters that look the same in other scripts ("Ν/S" typed with a Greek Ν), so a choice matches its legend.
export const LOOKALIKE: Record<string, string> = {
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  Ζ: 'Z',
}
export const fold = (t: string) =>
  t
    .replace(/[ΑΒΕΗΙΚΜΝΟΡΤΥΧΖ]/g, (c) => LOOKALIKE[c])
    .trim()
    .toLowerCase()
export const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Rows answered on the same scale, one under another ("Chapter 02 … ☐1 ☐2 ☐3 ☐4 ☐5 ☐N/S"): the text set tight
// above the first row says what they ask (its column names aside), and a legend on the page ("5 “excellent”
// means…", "1 = Poor") says what each choice means, written after the choice's name ("5 – excellent").
export function setScales(out: Question[], textOf: PageText) {
  for (let i = 0; i < out.length; ) {
    const choices = choicesOf(out[i]).map(fold)
    let j = i + 1
    while (
      choices.length >= 2 &&
      j < out.length &&
      out[j].page === out[i].page &&
      choicesOf(out[j]).map(fold).join('|') === choices.join('|')
    )
      j++
    if (j - i >= 2) scale(out.slice(i, j), choices, textOf)
    i = j
  }
}

export function scale(run: Question[], choices: string[], textOf: PageText) {
  const first = run[0]
  const lines = textOf(first.page) ?? []
  const y0 = top(first.parts.map((p) => p.field))
  const isHeader = (l: TextLine) => l.text.split(/\s+/).every((w) => choices.includes(fold(w)))
  const above = lines.filter((l) => l.y + l.height <= y0 + 0.002 && !isHeader(l)).sort((a, b) => b.y - a.y)
  const block: TextLine[] = []
  for (const l of above) {
    const below = block[block.length - 1]
    const gap = (below ? below.y : y0) - (l.y + l.height)
    if (gap > 1.2 * l.height || block.length === 3) break
    block.push(l)
  }
  const intro = block
    .reverse()
    .map((l) => l.text.trim())
    .join(' ')
  if (intro && !run.some((q) => norm(q.title) === norm(intro))) for (const q of run) q.intro = intro

  // The legend: lines that start with a choice's name, on this page or the next.
  const legend = new Map<string, string>()
  for (const l of [...lines, ...(textOf(first.page + 1) ?? [])]) {
    // A bullet before it may be a symbol font's private-use glyph (U+F0B7).
    const t = l.text.replace(/^[\s\p{Co}•●▪■◦*–-]+/u, '').trim()
    for (const c of choices) {
      if (legend.has(c)) continue
      const m = new RegExp(`^${escape(c)}\\s*(?:[=:–-]\\s*|\\s)(\\S.*)$`, 'i').exec(fold(t))
      if (!m) continue
      const rest = t.slice(t.length - m[1].length)
      const said =
        /[“"‘]([^”"’]{1,40})[”"’]/.exec(rest)?.[1] ??
        rest
          .split(/\s+means\s+/i)[0]
          .split(/\s+/)
          .slice(0, 6)
          .join(' ')
      legend.set(c, said.replace(/[.,;:]$/, ''))
    }
  }
  if (legend.size < Math.max(2, Math.ceil(0.6 * choices.length))) return
  for (const q of run)
    q.parts = q.parts.map((p) => {
      const said = legend.get(fold(p.name))
      return p.field.type === 'checkbox' && said ? { ...p, name: `${p.name} – ${said}` } : p
    })
}
