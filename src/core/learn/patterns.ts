// Patterns: what admins do with boxes, learnt by the boxes' cues (cues.ts), so that it carries over to forms
// auto-detect has never seen. From each save it learns, on the pages the admin changed:
//   - which boxes are fields: every box auto-detect proposed there, kept (1) or deleted or left empty (0), and every
//     field the admin drew (logistic regression, starting from the rules' own confidence);
//   - the type, required and grouping (Y / N / NA as one answer) admins gave them (counts per cue).
// At detection it suggests the boxes like those admins kept, also kinds the rules never suggest (answers printed
// in place of boxes, light filled boxes, blank cells, the space after a label); it leaves out boxes like those they
// deleted; and it gives a suggestion the type, required and grouping admins gave boxes like it.

import { overlap } from '../coords'
import { newId } from '../fields'
import { validateFields, type FieldDef, type FieldType, type Position } from '../form-logic'
import { cuesOf, type Candidate, type PageView } from './cues'
import { MAX_EXAMPLES, type EditSession, type Example, type Suggestion } from './lesson'
import { Counts, fit, logit, score, sigmoid, type Logistic, type Sample } from './model'
import { atPlaces, placesFor, placesOf, type Place } from './places'
import { shortHash } from './text'

// How many consistent examples it takes: the L2 prior of the regression (see fit), and the odds that change a type,
// set required or group boxes (4 to 1).
const L2 = 1
const ODDS = Math.log(4)
// A box and a field are the same place when they share this much (intersection over union).
const SAME_PLACE = 0.4
// A field from patterns never claims to be as sure as one put back from a page set up before.
const MAX_SURE = 0.97

/** A cue as lessons keep it: its words as hashes ("c:comment" → "c:1x9…"), its structure as it is. */
export const stored = (cue: string) =>
  cue.replace(
    /(^|\|)([a-z])([:^$~])([^|]+)/g,
    (_, bar: string, family: string, sep: string, word: string) => `${bar}${family}${sep}${shortHash(word)}`,
  )
// The cues that say what a field is for: the evidence for its type and settings. Its label is the text before it;
// without one, the line over it; without that, the text after it (a checkbox's). The others name other fields (the
// line over an answer line is the one before's label). Its column's header and what is printed in it count too.
function telling(cues: string[]) {
  const family = ['l', 'a', 'r'].find((f) => cues.some((c) => c.startsWith(`${f}:`)))
  return cues.filter((c) => (family && new RegExp(`^${family}[:^$~]`).test(c)) || /^[ct][:^$~]/.test(c) || c === 't-choices')
}
// A label's word means the same before a box, over it or after it ("Expiry:" beside one box, over another).
const meaning = (cue: string) => cue.replace(/^[lar]([:^$~])/, 'w$1')
// The cues that say whether boxes beside one another answer one question: their column's header, how many.
const grouping = (cue: string) => /^c:|^row\d|^k=/.test(cue)

function sharedPlace(a: Position, b: Position) {
  if (a.page !== b.page) return 0
  const i = overlap(a.x, a.x + a.width, b.x, b.x + b.width) * overlap(a.y, a.y + a.height, b.y, b.y + b.height)
  return i / (a.width * a.height + b.width * b.height - i)
}
// A field drawn tight around "Yes/No" in a cell, or loosely around a box, is still in that box's place: the smaller
// one sits in the larger and is a fair part of it.
function samePlace(a: Position, b: Position) {
  const s = sharedPlace(a, b)
  if (s >= SAME_PLACE || a.page !== b.page) return s
  const [small, big] = a.width * a.height < b.width * b.height ? [a, b] : [b, a]
  const [cx, cy] = [small.x + small.width / 2, small.y + small.height / 2]
  const inside = cx > big.x && cx < big.x + big.width && cy > big.y && cy < big.y + big.height
  return inside && small.width * small.height >= 0.2 * big.width * big.height ? SAME_PLACE : s
}
const atPlace = (fields: FieldDef[], p: Position) => {
  let best: FieldDef | undefined
  let most = SAME_PLACE
  for (const f of fields) {
    const s = samePlace(f.position, p)
    if (s >= most) [best, most] = [f, s]
  }
  return best
}

/**
 * What a save teaches about boxes: on the pages the admin changed (`touched`, layout pages with their `views`),
 * every box auto-detect proposes there (kept, or deleted / left empty) and every field drawn where it proposes
 * nothing (`examples`, null when there is nothing to learn); and the fields in the place of a box it proposes
 * (`placed`: learnt from by their box, so not also by the line next to them). Fields drawn where nothing was proposed
 * give `places` (places.ts): those and the places of lessons before (`earlier`) are tried next to every line of the
 * pages, and the boxes there teach too, kept where the admin drew or kept one, not where they did not.
 */
export function examplesOf(views: Map<number, PageView>, s: EditSession, touched: Set<number>, earlier: Place[] = []) {
  // Every suggestion deleted, and many of them: the admin started again, which says nothing about each one.
  const restart = s.suggested.length >= 10 && s.suggested.every((f) => !s.saved.some((g) => g.id === f.id))
  const cues: string[] = []
  const at = new Map<string, number>()
  const examples = new Map<string, Example>()
  const add = (plain: string[], field: FieldDef | undefined, prior?: number) => {
    const c = [...new Set(plain.map(stored))]
      .map((k) => at.get(k) ?? (at.set(k, cues.length), cues.push(k) - 1))
      .sort((a, b) => a - b)
    const e: Example = {
      c,
      y: field ? 1 : 0,
      ...(prior != null && { p: Math.round(prior * 100) / 100 }),
      ...(field && { t: field.type }),
      ...(field?.required && { r: true as const }),
      ...(field?.group && { g: field.group.mode }),
    }
    const key = JSON.stringify(e)
    const same = examples.get(key)
    if (same) same.n = (same.n ?? 1) + 1
    else if (examples.size < MAX_EXAMPLES) examples.set(key, e)
  }
  const pages = [...views].filter(([page]) => touched.has(page))
  const savedOn = (page: number) => s.saved.filter((f) => f.position.page === page && !f.dialogOnly)
  const placed = new Set<FieldDef>()
  for (const [page, view] of pages) {
    const saved = savedOn(page)
    for (const c of view.candidates) {
      const f = atPlace(saved, c.field.position)
      if (f) placed.add(f)
      else if (restart) continue
      add(cuesOf(c.field.position, c.kind, view, c.field.type), f, c.prior)
    }
  }
  // Where the admin drew fields that nothing was proposed for.
  const given = new Set([...s.before, ...s.suggested].map((f) => f.id))
  const places: Place[] = []
  for (const [page, view] of pages) {
    const saved = savedOn(page).map((f) => ({ f, p: f.position }))
    const drawn = saved.filter(({ f }) => !placed.has(f) && !given.has(f.id)).map(({ p }) => p)
    places.push(...placesOf(view, drawn, saved.map(({ p }) => p)))
  }
  const tried = placesFor([earlier, places])
  const atAPlace = new Set<FieldDef>()
  for (const [page, view] of pages) {
    const saved = savedOn(page)
    const boxes = atPlaces(view, tried, page, [], view.candidates)
    // The page as detection sees it with the boxes at places on it (they count each other, as in a row).
    const seen = { ...view, candidates: [...view.candidates, ...boxes] }
    for (const c of boxes) {
      const f = atPlace(
        saved.filter((g) => !placed.has(g) && !atAPlace.has(g)),
        c.field.position,
      )
      if (f) atAPlace.add(f)
      else if (restart) continue
      add(cuesOf(c.field.position, c.kind, seen, c.field.type), f, c.prior)
    }
    for (const f of saved) if (!placed.has(f) && !atAPlace.has(f)) add(cuesOf(f.position, 'none', view), f)
  }
  const unique = [...new Map(places.map((p) => [JSON.stringify(p), p])).values()]
  return { taught: examples.size ? { cues, examples: [...examples.values()] } : null, placed, places: unique }
}

/** What the examples of all lessons teach, ready for detection: null without examples. */
export function patternsFor(taught: { cues: string[]; examples: Example[] }[]) {
  const index = new Map<string, number>()
  const idx = (k: string) => index.get(k) ?? (index.set(k, index.size), index.size - 1)
  const samples: Sample[] = []
  // The types admins gave, per type auto-detect had given (a phone stays a phone where "number" texts did not).
  const types = new Map<string, Counts<FieldType>>()
  const typesFrom = (rt: string) => types.get(rt) ?? (types.set(rt, new Counts<FieldType>()), types.get(rt)!)
  const required = new Counts<'yes' | 'no'>()
  const groups = new Counts<'single' | 'multiple' | 'none'>()
  const alike = new Map<string, Sample>()
  let boxes = 0
  for (const { cues, examples } of taught)
    for (const e of examples) {
      const k = e.c.map((i) => cues[i])
      const n = e.n ?? 1
      // Many boxes alike in one save count, but less than as many saves would.
      const weight = 1 + Math.log(n)
      boxes += n
      // Boxes alike in different saves are one sample with their weights added: training takes as long for many
      // lessons about the same kind of form as for one.
      if (e.p != null) {
        const x = k.map(idx).sort((a, b) => a - b)
        const key = `${e.y}|${e.p}|${x.join()}`
        const same = alike.get(key)
        if (same) same.weight += weight
        else alike.set(key, { x, y: e.y, offset: logit(e.p), weight })
      }
      if (!e.y || !e.t) continue
      const said = [...new Set(telling(k).map(meaning))]
      typesFrom(k.find((c) => c.startsWith('rt='))?.slice(3) ?? '').add(said, e.t, weight)
      required.add([...said, `type=${e.t}`], e.r ? 'yes' : 'no', weight)
      if (e.t === 'checkbox') groups.add(k.filter(grouping), e.g ?? 'none', weight)
    }
  if (!boxes) return null
  samples.push(...alike.values())
  const model: Logistic | null = samples.length ? fit(samples, index.size, { l2: L2 }) : null
  // A box's cues as the model's indexes (a cue no lesson had: none, Infinity).
  const indexes = (plain: string[]) => plain.map((c) => index.get(stored(c)) ?? Infinity)

  /** How likely a proposed box is a field, and the cues that made it more likely the most. */
  function judge(c: Candidate, view: PageView) {
    const plain = cuesOf(c.field.position, c.kind, view, c.field.type)
    if (!model) return { p: c.prior, plain, why: [] as string[] }
    const x = indexes(plain)
    const p = sigmoid(score(model, x, logit(c.prior)))
    const k = 1 / Math.sqrt(x.length || 1)
    const why = plain
      .map((cue, j) => ({ cue, w: x[j] < model.w.length ? model.w[x[j]] * k : 0 }))
      .filter((o) => o.w > 0.05)
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
      .map((o) => o.cue)
    return { p, plain, why }
  }

  /** The type admins gave boxes with these cues, where it differs from `type` and they did so clearly enough. */
  function typeOf(plain: string[], type: FieldType) {
    const said = telling(plain)
    const keys = [...new Set(said.map((c) => meaning(stored(c))))]
    let best: { type: FieldType; odds: number; why: string[] } | undefined
    const from = types.get(type)
    for (const t of from?.classes() ?? []) {
      if (t === type) continue
      const e = from!.evidence(keys, t, type, { min: 1 })
      if (e.odds >= ODDS && e.telling.length && (!best || e.odds > best.odds))
        best = { type: t, odds: e.odds, why: said.filter((c) => e.telling.includes(meaning(stored(c)))) }
    }
    return best
  }

  /** Whether admins make fields like this required (true), clearly enough. */
  function requiredOf(plain: string[], type: FieldType) {
    const said = [...new Set(telling(plain).map((c) => meaning(stored(c)))), `type=${type}`]
    const e = required.evidence(said, 'yes', 'no', { prior: true })
    return e.odds >= ODDS && e.telling.length > 0
  }

  /** How admins group a row of checkboxes with these cues: one answer ('single'), any ('multiple'), or not. */
  function groupOf(rows: string[][]) {
    let best: { mode: 'single' | 'multiple'; odds: number } | undefined
    for (const mode of ['single', 'multiple'] as const) {
      let odds = 0
      let told = false
      for (const plain of rows) {
        const e = groups.evidence(plain.filter(grouping).map(stored), mode, 'none', { prior: true })
        odds += e.odds / rows.length
        told ||= e.telling.length > 0
      }
      if (odds >= ODDS && told && (!best || odds > best.odds)) best = { mode, odds }
    }
    return best?.mode
  }

  return {
    /** How many boxes the lessons tell about. */
    boxes,
    /**
     * The suggestions of a page from what auto-detect proposes there (`view.candidates`: its rules' suggestions,
     * already adjusted by `adjusted`, and the boxes it suggests only when taught), with what admins did with boxes
     * like them. `known(label)`: the label was kept or deleted by name before, which says more than its cues.
     */
    review(
      view: PageView,
      adjusted: Map<Candidate, Suggestion | null>,
      known: (label: string) => boolean,
      decided: Position[],
      pageCount: number,
    ): Suggestion[] {
      const out: Suggestion[] = []
      const made = new Map<Suggestion, string[]>()
      const take = (s: Suggestion, plain: string[]) => {
        out.push(s)
        made.set(s, plain)
      }
      const ok = (s: Suggestion) => !validateFields([{ ...s, id: 'x', key: 'x' }], pageCount).length
      const clash = (p: Position, also: Position[]) =>
        [...decided, ...also].some((t) => sharedPlace(t, p) > 0.3 || samePlace(t, p) >= SAME_PLACE)
      // The rules' suggestions first, in their order; then the boxes only learning suggests, likeliest first.
      const ruled = view.candidates.filter((c) => adjusted.has(c))
      const taught = view.candidates
        .filter((c) => !adjusted.has(c))
        .map((c) => ({ c, ...judge(c, view) }))
        .filter((o) => o.p >= 0.5)
        .sort((a, b) => b.p - a.p)
      for (const c of ruled) {
        const s = adjusted.get(c)
        if (!s) continue
        const { p, plain, why } = judge(c, view)
        // Learnt by name (kept or deleted with this label before): that wins over its cues.
        if (p < 0.5 && !known(s.label)) continue
        // Its confidence follows what was learnt where that says something clearly different from its rule.
        const learnt = s.confidence === c.field.confidence && Math.abs(p - c.prior) > 0.05
        take(retyped(learnt ? { ...s, confidence: sure(p) } : s, c, plain, why), plain)
      }
      for (const { c, p, plain, why } of taught) {
        if (clash(c.field.position, out.map((s) => s.position))) continue
        const s = retyped({ ...c.field, confidence: sure(p), taught: why }, c, plain, why)
        if (ok(s)) take(s, plain)
      }
      // Rows of checkboxes that admins answer as one question (Y / N / NA): boxes on one line, close together (two
      // questions side by side are two rows).
      const [W, H] = [view.width, view.height]
      const boxesOf = out.filter((s) => s.type === 'checkbox' && !s.group && !s.dialogOnly)
      const rows: Suggestion[][] = []
      const mid = (f: Suggestion) => (f.position.y + f.position.height / 2) * H
      for (const s of boxesOf.sort((a, b) => a.position.x - b.position.x)) {
        const row = rows.find((r) => {
          const last = r[r.length - 1].position
          const gap = (s.position.x - last.x - last.width) * W
          return Math.abs(mid(r[0]) - mid(s)) < 4 && gap < 4 * Math.max(last.width * W, 6)
        })
        if (row) row.push(s)
        else rows.push([s])
      }
      for (const row of rows) {
        if (row.length < 2) continue
        const mode = groupOf(row.map((s) => made.get(s) ?? []))
        if (!mode) continue
        const group = { id: newId(), mode }
        for (const s of row) {
          const i = out.indexOf(s)
          out[i] = { ...s, group, taught: s.taught ?? ['grouped'] }
        }
      }
      return out

      // Type and required as admins set boxes like this one, where the label's own lesson did not set them.
      function retyped(s: Suggestion, c: Candidate, plain: string[], why: string[]): Suggestion {
        let r = s
        if (s.type === c.field.type) {
          const t = typeOf(plain, s.type)
          const next = t && { ...r, type: t.type, taught: [...(r.taught ?? why), ...t.why] }
          if (next && ok(next)) r = next
        }
        if (r.required == null && requiredOf(plain, r.type)) r = { ...r, required: true, taught: r.taught ?? why }
        return r
      }
    },
  }
}

const sure = (p: number) => Math.min(MAX_SURE, Math.round(p * 100) / 100)
