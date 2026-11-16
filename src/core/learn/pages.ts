// Page memory: a page the admin set up comes back as they saved it, in a new revision of the form or in any form that
// has the same page (a cover page). A page is known again by the lines of text only it has in its document (a scan:
// by its picture), and each field moves with the line of text nearest to it.

import { clashes, fitInPage } from '../coords'
import { newId } from '../fields'
import type { FieldDef, Position } from '../form-logic'
import { renamed, usedBy } from './conditions'
import {
  CONDITIONS,
  REMEMBERED,
  settingsOf,
  type EditSession,
  type Forget,
  type Mark,
  type PageMemory,
  type RememberedField,
  type Suggestion,
} from './lesson'
import { inkOf, sameInk, SAME_PICTURE } from './picture'
import { mark, ownLines, r4, textOf, uniqueOn, type Line, type PageText, type TextPdf } from './text'

// A page needs this many lines of its own to be known again, and a page memory this much of them in common
// (Dice: 1 = the same lines). A memory keeps a sample of them.
const MIN_OWN = 3
const SAME_PAGE = 0.8
const SAMPLE = 24

/**
 * How a page's lines moved since a memory of it: the shift that most of them share. undefined when fewer than half
 * moved alike: the same text in another layout (another font size, page size or style), not the same page.
 */
function steady(text: Mark[], here: Map<string, Line>) {
  const moves = text.flatMap((t) => {
    const h = here.get(t[0])
    return h ? [[h.x - t[1], h.y - t[2]]] : []
  })
  if (!moves.length) return
  const mid = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]
  const shift = [mid(moves.map((d) => d[0])), mid(moves.map((d) => d[1]))]
  const alike = moves.filter((d) => Math.abs(d[0] - shift[0]) <= 0.01 && Math.abs(d[1] - shift[1]) <= 0.01).length
  return alike >= Math.max(MIN_OWN, moves.length / 2) ? shift : undefined
}

/** The line nearest to a box (distance 0 inside it): mostly the field's own label. */
function nearest(lines: Iterable<Line>, p: Position) {
  const gap = (l: Line) =>
    Math.hypot(Math.max(p.x - l.x, 0, l.x - p.x - p.width), Math.max(p.y - l.y, 0, l.y - p.y - p.height))
  let best: Line | undefined
  for (const l of lines) if (!best || gap(l) < gap(best)) best = l
  return best
}

/** The pages (of the layout) whose fields the admin changed in a session. */
export function touchedPages({ before, suggested, saved }: EditSession) {
  const given = [...before, ...suggested]
  const pages = new Set([...given, ...saved].map((f) => f.position.page))
  return new Set([...pages].filter((p) => pageState(given, p) !== pageState(saved, p)))
}

// A page's fields as the admin sees them (not ids: those change by themselves).
const pageState = (fields: FieldDef[], page: number) =>
  fields
    .filter((f) => f.position.page === page)
    .map((f) =>
      JSON.stringify([settingsOf(f), f.position, f.group, f.dialogOnly, ...CONDITIONS.map((k) => f[k]), f.followUp]),
    )
    .sort()
    .join('\n')

/** Whether a box sits on a page's boxes and lines; undefined when that cannot be told. */
export type Drawing = (source: number) => Promise<((p: Position) => boolean) | undefined>

/** The pages the admin changed in this session, as they are saved now (and the pages their conditions use). */
export async function memoryOf(
  pdf: TextPdf,
  pages: { source: number | null }[],
  s: EditSession,
  drawing?: Drawing,
): Promise<PageMemory[]> {
  const given = [...s.before, ...s.suggested]
  const want = new Set(
    pages.flatMap((p, i) => (p.source && pageState(given, i + 1) !== pageState(s.saved, i + 1) ? [i + 1] : [])),
  )
  if (!want.size) return []
  // A condition or follow-up can only come back with the fields it uses: their pages come too.
  const pageOf = new Map(s.saved.map((f) => [f.key, f.position.page]))
  for (let more = true; more; ) {
    more = false
    for (const f of s.saved)
      if (want.has(f.position.page))
        for (const k of usedBy(f)) {
          const p = pageOf.get(k)
          if (p && pages[p - 1]?.source && !want.has(p)) {
            want.add(p)
            more = true
          }
        }
  }
  const sources = pages.flatMap((p) => (p.source ? [p.source] : []))
  const texts = await textOf(pdf, sources)
  const own = ownLines(texts, sources)
  const out: { memory: PageMemory; fields: FieldDef[]; anchors: Line[] }[] = []
  for (const n of [...want].sort((a, b) => a - b)) {
    const source = pages[n - 1].source!
    const fields = s.saved.filter((f) => f.position.page === n)
    // A page left without fields may just not be done yet: it keeps getting suggestions (and loses wrong ones label
    // by label).
    if (!fields.some((f) => !f.dialogOnly)) continue
    const kept = fields.map((f) => f.position)
    const removed = given
      .filter((f) => f.position.page === n && !f.dialogOnly && !clashes(kept, f.position))
      .map(({ position: p }): [number, number, number, number] => [r4(p.x), r4(p.y), r4(p.width), r4(p.height)])
    const mine = own(source)
    // Too little text of its own (a scan, a page like many others): known by its picture, if it can be drawn.
    const image = mine.length < MIN_OWN ? await inkOf(pdf, source) : undefined
    if (mine.length < MIN_OWN && !image) continue
    const sample = [...mine].sort((a, b) => a.n - b.n).slice(0, SAMPLE)
    const sitting = await drawing?.(source)
    let onDrawing = sitting ? fields.flatMap((f, j) => (!f.dialogOnly && sitting(f.position) ? [j] : [])) : []
    // A few spread over the page tell as much as all of them.
    if (onDrawing.length > 8)
      onDrawing = Array.from({ length: 8 }, (_, k) => onDrawing[Math.floor((k * onDrawing.length) / 8)])
    out.push({
      fields,
      anchors: [...uniqueOn(texts.get(source)?.lines ?? []).values()],
      memory: {
        text: sample.map(mark),
        ...(mine.length > SAMPLE && { lines: mine.length }),
        ...(image && { image }),
        ...(onDrawing.length >= 2 && { onDrawing }),
        fields: [],
        ...(removed.length && { removed }),
      },
    })
  }
  // Conditions and follow-ups name fields as p<page>_<field> of this lesson.
  const ref = new Map<string, string>()
  out.forEach((o, m) => o.fields.forEach((f, j) => ref.set(f.key, `p${m}_${j}`)))
  const to = (k: string) => ref.get(k)
  for (const o of out) {
    const anchors: Line[] = []
    o.memory.fields = o.fields.map((f) => {
      const p = f.position
      const line = nearest(o.anchors, p)
      if (line && !anchors.includes(line)) anchors.push(line)
      const r: RememberedField = {
        settings: settingsOf(f),
        box: [r4(p.x), r4(p.y), r4(p.width), r4(p.height)],
        ...(line && { anchor: anchors.indexOf(line) }),
        ...(f.group && { group: f.group }),
        ...(f.dialogOnly && { dialogOnly: true as const }),
      }
      for (const k of CONDITIONS) {
        const c = f[k] && renamed(f[k], to)
        if (c) r[k] = c
      }
      const when = f.followUp && renamed(f.followUp.when, to)
      const asks = f.followUp?.fields.flatMap((k) => ref.get(k) ?? []) ?? []
      if (when && asks.length) r.followUp = { ...f.followUp!, when, fields: asks }
      return r
    })
    if (anchors.length) o.memory.anchors = anchors.map(mark)
  }
  return out.map((o) => o.memory)
}

/** A page memory of a lesson; `id` and `i` (its index in the lesson's pages) name it for forgetting. */
export interface Memory {
  at: number
  id: string
  i: number
  m: PageMemory
}

/**
 * The pages set up before (`memories`), ready to be put back on the pages `sources` of `pdf`: `remembered` gives a
 * page's fields as they were saved, placed on it, or null for a page not set up before.
 */
export async function pagesFor(memories: Memory[], pdf: TextPdf, sources: number[]) {
  // Memories by the lines they know a page by.
  const index = new Map<string, number[]>()
  for (const [i, x] of memories.entries())
    for (const [h] of x.m.text) {
      const list = index.get(h)
      if (list) list.push(i)
      else index.set(h, [i])
    }
  const texts = memories.length ? await textOf(pdf, sources) : new Map<number, PageText>()
  const own = ownLines(texts, sources)
  const groups = new Map<string, string>()

  // Pages without text of their own, known by their picture. A memory goes to the page most like it, one page each,
  // so pages that look alike (a scanned form's continuation pages) do not all take it.
  const byPicture = new Map<number, Memory[]>()
  const pictures = memories.filter((x) => x.m.image)
  if (pictures.length) {
    const scores: { n: number; x: Memory; score: number }[] = []
    for (const n of new Set(sources)) {
      const ink = own(n).length < MIN_OWN ? await inkOf(pdf, n) : undefined
      if (ink)
        for (const x of pictures) {
          const score = sameInk(ink, x.m.image!)
          if (score >= SAME_PICTURE) scores.push({ n, x, score })
        }
    }
    scores.sort((a, b) => b.score - a.score || b.x.at - a.x.at)
    const used = new Set<Memory>()
    for (const { n, x, score } of scores) {
      if (byPicture.has(n) || used.has(x)) continue
      // With the memories as like this page as it is: copies of the same page, from other saves.
      const copies = scores.filter((o) => o.n === n && o.score >= score - 0.01 && !used.has(o.x)).map((o) => o.x)
      copies.forEach((c) => used.add(c))
      byPicture.set(n, copies)
    }
  }

  // A page memory's fields on layout page `page`: each moves as the line nearest to it moved; without that line,
  // as most of the page's lines did.
  const place = ({ id, i, m }: Memory, shift: number[], here: Map<string, Line>, page: number) =>
    m.fields.map((f, j): Suggestion => {
      const a = f.anchor != null ? m.anchors?.[f.anchor] : undefined
      const moved = a && here.get(a[0])
      const [dx, dy] = moved ? [moved.x - a[1], moved.y - a[2]] : shift
      const [x, y, width, height] = f.box
      let group = f.group
      if (group) {
        const was = `${id}:${group.id}`
        if (!groups.has(was)) groups.set(was, newId())
        group = { ...group, id: groups.get(was)! }
      }
      const ours = (k: string) => `${id}|${k}`
      const s: Suggestion = {
        ...f.settings,
        ...(group && { group }),
        ...(f.dialogOnly && { dialogOnly: true }),
        source: 'ai',
        confidence: REMEMBERED,
        position: fitInPage({ page, x: x + dx, y: y + dy, width, height }),
        ref: ours(`p${i}_${j}`),
      }
      for (const k of CONDITIONS) if (f[k]) s[k] = renamed(f[k], ours)
      if (f.followUp)
        s.followUp = { ...f.followUp, when: renamed(f.followUp.when, ours)!, fields: f.followUp.fields.map(ours) }
      return s
    })

  return {
    /**
     * The fields of a page set up before, placed on layout page `page`, and where the admin removed fields; null
     * when the page is new.
     */
    remembered(
      source: number,
      page: number,
      onDrawing?: (p: Position) => boolean,
    ): { fields: Suggestion[]; removed: Position[] } | null {
      const mine = own(source)
      const here = uniqueOn(texts.get(source)?.lines ?? [])
      const found: { x: Memory; score: number; shift: number[] }[] = []
      if (mine.length >= MIN_OWN) {
        const hits = new Map<number, number>()
        for (const l of mine) for (const i of index.get(l.h) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1)
        for (const [i, n] of hits) {
          const { m } = memories[i]
          const all = m.lines ?? m.text.length
          // The memory's share of its lines found here (from its sample), as Dice over all lines.
          const score = (2 * (n / m.text.length) * all) / (all + mine.length)
          const shift = score >= SAME_PAGE && steady(m.text, here)
          if (shift) found.push({ x: memories[i], score, shift })
        }
      } else found.push(...(byPicture.get(source) ?? []).map((x) => ({ x, score: 1, shift: [0, 0] })))
      found.sort((a, b) => b.score - a.score || b.x.at - a.x.at)
      // Forgetting this page forgets every memory of it.
      const why: Forget = { pages: found.map(({ x }) => [x.id, x.i]) }
      for (const { x, shift } of found) {
        const back = place(x, shift, here, page)
        // Most of the fields that sat on its boxes and lines do not: its drawing changed (the same text in another
        // form), it is not the page set up before.
        const sample = x.m.onDrawing ?? []
        const still = onDrawing ? sample.filter((j) => back[j] && onDrawing(back[j].position)).length : sample.length
        if (2 * still < sample.length) continue
        const removed = (x.m.removed ?? []).map(([rx, ry, width, height]) =>
          fitInPage({ page, x: rx + shift[0], y: ry + shift[1], width, height }),
        )
        return { fields: back.map((s) => ({ ...s, why })), removed }
      }
      return null
    },
  }
}
