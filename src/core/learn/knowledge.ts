// What all the lessons know together, and the summary of it that the editor's Learnt tab shows.

import { DRAWN_TIMES, timesOf } from './drawn'
import type { Vote } from './labels'
import { validateLesson, type DrawnNote, type FieldSettings, type Lesson, type SettingsChange } from './lesson'
import { labelHash } from './text'

/** Adds `v` to the list of `k`. */
function add<K, V>(map: Map<K, V[]>, k: K, v: V) {
  const list = map.get(k)
  if (list) list.push(v)
  else map.set(k, [v])
}

/**
 * What the lessons know, oldest first: after the last "forget everything", without what a later lesson forgot.
 * Per label (hash), a vote of each lesson; per line, the fields drawn next to it; the pages set up before.
 */
export function knowledge(lessons: Lesson[]) {
  const sorted = [...lessons].sort((a, b) => a.at - b.at)
  let start = 0
  for (const [i, l] of sorted.entries()) if (l.forget?.all) start = i
  const live = sorted.slice(start)
  const forgot = new Map<string, number>()
  const forgotPages = new Set<string>()
  for (const l of live) {
    for (const h of [...(l.forget?.labels ?? []), ...(l.forget?.drawn ?? [])]) forgot.set(h, l.at)
    for (const [id, i] of l.forget?.pages ?? []) forgotPages.add(`${id}#${i}`)
  }
  const known = (h: string, at: number) => at >= (forgot.get(h) ?? -Infinity)
  const votes = new Map<string, Vote[]>()
  const vote = (h: string, v: Vote) => known(h, v.at) && add(votes, h, v)
  const drawn = new Map<string, { at: number; note: DrawnNote }[]>()
  for (const l of live) {
    for (const n of l.labels)
      vote(labelHash(n.label), { at: l.at, keep: n.kept > 0, label: n.label, ...(n.change && { change: n.change }) })
    for (const h of l.kept ?? []) vote(h, { at: l.at, keep: true })
    for (const note of l.drawn ?? []) if (known(note.line, l.at)) add(drawn, note.line, { at: l.at, note })
  }
  const memories = live.flatMap((l) =>
    l.pages.flatMap((m, i) => (forgotPages.has(`${l.id}#${i}`) ? [] : [{ at: l.at, id: l.id, i, m }])),
  )
  // What boxes taught: the examples after the last "forget patterns".
  let from = 0
  for (const [i, l] of live.entries()) if (l.forget?.patterns) from = i
  const taught = live.slice(from).flatMap((l) => (l.examples?.length ? [{ cues: l.cues ?? [], examples: l.examples }] : []))
  return { votes, drawn, memories, taught }
}

/** What auto-detect learnt (for a "what it learnt" view): changes and deletions per label, fields it draws, pages. */
export interface Learnt {
  /** Labels auto-detect changes or leaves out, newest first. `hash`: what `forget.labels` takes. */
  labels: { label: string; hash: string; drop: boolean; change: SettingsChange; at: number }[]
  /** Fields it draws next to a line (drawn there by hand `times` times), newest first. */
  drawn: { line: string; settings: FieldSettings; times: number; at: number }[]
  /** Pages it puts back as they were set up (a page saved in several sessions counts once). */
  pages: number
  /** What boxes taught (pattern learning): how many boxes, from how many saves. */
  patterns: { boxes: number; saves: number }
}

/** What the lessons taught, after what was forgotten. */
export function learnt(lessons: Lesson[] | undefined): Learnt {
  const unlimited = { maxFields: Infinity, maxPages: Infinity }
  const { votes, drawn, memories, taught } = knowledge((lessons ?? []).filter((l) => !validateLesson(l, unlimited).length))
  const labels = [...votes]
    .flatMap(([h, vs]) => {
      const last = vs.slice(-2)
      const drop = last.length === 2 && !last[0].keep && !last[1].keep
      const change = Object.assign({}, ...vs.map((v) => v.change)) as SettingsChange
      const label = [...vs].reverse().find((v) => v.label)?.label
      const at = vs[vs.length - 1].at
      return label && (drop || Object.keys(change).length) ? [{ label, hash: h, drop, change, at }] : []
    })
    .sort((a, b) => b.at - a.at)
  const fields = [...drawn]
    .flatMap(([line, ns]) =>
      timesOf(ns) >= DRAWN_TIMES
        ? [{ line, settings: ns[ns.length - 1].note.settings, times: timesOf(ns), at: ns[ns.length - 1].at }]
        : [],
    )
    .sort((a, b) => b.at - a.at)
  const pages = new Set(memories.map(({ m }) => m.image ?? m.text.map((t) => t[0]).join()))
  const boxes = taught.reduce((n, t) => n + t.examples.reduce((m, e) => m + (e.n ?? 1), 0), 0)
  return { labels, drawn: fields, pages: pages.size, patterns: { boxes, saves: taught.length } }
}
