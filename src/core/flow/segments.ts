// The flow's text for search, and its blocks cut into segments by question (what the list view pages through).

import type { Question } from '../questions'
import type { FlowBlock, FlowSegment } from './types'

export const partsOf = (b: FlowBlock) => (b.cells?.flatMap((c) => c.paras) ?? b.paras ?? []).flatMap((p) => p.parts)

/** The flow's text, for search. */
export const flowText = (blocks: FlowBlock[]) =>
  blocks
    .flatMap((b) =>
      (b.cells?.flatMap((c) => c.paras) ?? b.paras ?? []).map((p) =>
        p.parts.map((x) => ('text' in x ? x.text : '')).join(''),
      ),
    )
    .join('\n')

/**
 * The flow cut where each numbered question ends (its fields under one `section`), else each question: a filter
 * showing a question shows its whole stretch, from the end of the one before, with all its text.
 */
export function flowSegments(blocks: FlowBlock[], questions: Question[]): FlowSegment[] {
  const at = new Map<string, number>()
  blocks.forEach((b, i) => {
    for (const p of partsOf(b)) if ('field' in p) at.set(p.field.id, i)
  })
  const ends: number[] = []
  const owner = new Map<number, string[]>()
  let key: string | undefined
  for (const q of questions) {
    const idx = q.parts.map((p) => at.get(p.field.id)).filter((i): i is number => i != null)
    if (!idx.length) continue
    const k = q.section ?? q.id
    if (k !== key) {
      ends.push(-1)
      key = k
    }
    ends[ends.length - 1] = Math.max(ends[ends.length - 1], ...idx)
    const first = Math.min(...idx)
    owner.set(first, [...(owner.get(first) ?? []), q.id])
  }
  const cuts = new Set(ends)
  const out: FlowSegment[] = []
  let cur: FlowSegment = { blocks: [], questions: [] }
  blocks.forEach((b, i) => {
    cur.blocks.push(b)
    cur.questions.push(...(owner.get(i) ?? []))
    if (cuts.has(i)) {
      out.push(cur)
      cur = { blocks: [], questions: [] }
    }
  })
  if (cur.blocks.length) out.push(cur)
  return out
}
