// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectDocument, type Ops } from './detect'
import type { FieldDef, FieldType } from './form-logic'
import { addLesson, learnedFor, lessonFor, REMEMBERED, validateLesson, type EditSession, type Lesson } from './learn'

// A made-up PDF: pages of text lines [text, x, y] in points (600 × 800, y from the top).
type Line = [string, number, number]
const fakePdf = (...pages: Line[][]) => ({
  getPage: async (n: number) => ({
    view: [0, 0, 600, 800],
    getTextContent: async () => ({
      items: pages[n - 1].map(([str, x, y]) => ({ str, transform: [10, 0, 0, 10, x, 800 - y], width: str.length * 5 })),
    }),
  }),
})
const field = (id: string, label: string, type: FieldType, x: number, y: number, more: Partial<FieldDef> = {}): FieldDef => ({
  id,
  key: id,
  label,
  type,
  source: 'ai',
  confidence: 0.8,
  position: { page: 1, x, y, width: 0.3, height: 0.02 },
  ...more,
})
const session = (suggested: FieldDef[], saved: FieldDef[], before: FieldDef[] = []): EditSession => ({ id: 's', before, suggested, saved })
const lessonOf = async (s: EditSession, at = 1) => (await lessonFor(fakePdf([['x', 0, 0]]), [], s, at))!

const REPORT: Line[] = [
  ['Site inspection report', 50, 60],
  ['Site name:', 50, 100],
  ['Permit number:', 50, 140],
  ['Manager:', 50, 180],
  ['Date of inspection:', 50, 220],
]
const FLOOR: Line[] = [
  ['Floor checklist', 50, 60],
  ['Hatch covers', 50, 100],
  ['Mooring lines', 50, 140],
  ['Lifeboats', 50, 180],
]
const PAGES = [{ source: 1 }, { source: 2 }]
const at = (fields: { position: FieldDef['position'] }[] | null | undefined) =>
  (fields ?? []).map((f) => [Math.round(f.position.x * 1000) / 1000, Math.round(f.position.y * 1000) / 1000])

describe('page memory', () => {
  const site = field('a', 'Site name', 'text', 0.25, 0.11)
  const drawn = { ...field('b', 'Inspected on', 'date', 0.35, 0.265), source: 'manual' as const }
  const saved = [{ ...site, label: 'Location' }, drawn]
  const teach = () => lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([site], saved))

  it('remembers the pages the admin changed, as saved', async () => {
    const lesson = (await teach())!
    expect(validateLesson(lesson)).toEqual([])
    expect(lesson.pages).toHaveLength(1) // the floor page was left as it was
    expect(lesson.pages[0].fields.map((f) => [f.settings.label, f.settings.type])).toEqual([
      ['Location', 'text'],
      ['Inspected on', 'date'],
    ])
    expect(JSON.stringify(lesson)).not.toMatch(/inspection report|Permit number/i) // the page's text: only hashes
  })

  it('puts a page back in a new revision; each field moves with the line next to it', async () => {
    const lesson = JSON.parse(JSON.stringify(await teach())) as Lesson
    // Revision 2: a line added after "Permit number:" pushes the lines under it 40 pt down.
    const revised: Line[] = [...REPORT.slice(0, 3), ['Call sign:', 50, 180], ['Manager:', 50, 220], ['Date of inspection:', 50, 260]]
    const learned = (await learnedFor([lesson], fakePdf(revised, FLOOR), [1, 2], 2))!
    const back = learned.remembered(1, 1)
    expect(back?.map((f) => [f.label, f.type, f.source, f.confidence])).toEqual([
      ['Location', 'text', 'ai', REMEMBERED],
      ['Inspected on', 'date', 'ai', REMEMBERED],
    ])
    expect(at(back)).toEqual([
      [0.25, 0.11], // by "Site name:", which did not move
      [0.35, 0.315], // by "Date of inspection:", 40 pt (0.05 of the page) lower
    ])
    expect(learned.remembered(2, 2)).toBeNull()
  })

  it('does not take the same text in another layout for the same page', async () => {
    const lesson = (await teach())!
    const stretched = REPORT.map(([t, x, y]): Line => [t, x * 1.2, y * 1.3])
    const learned = (await learnedFor([lesson], fakePdf(stretched, FLOOR), [1, 2], 2))!
    expect(learned.remembered(1, 1)).toBeNull()
  })

  it('does not take another page that shares part of its lines for the same page', async () => {
    const lesson = (await teach())!
    // The same header block in the same place, other questions under it.
    const other: Line[] = [...REPORT.slice(0, 3), ['Address:', 50, 180], ['Agent:', 50, 220], ['Contractor:', 50, 260]]
    const learned = (await learnedFor([lesson], fakePdf(other, FLOOR), [1, 2], 2))!
    expect(learned.remembered(1, 1)).toBeNull()
  })

  it('does not remember a page left without fields (it may not be done yet)', async () => {
    const lesson = await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([site], []))
    expect(lesson?.pages).toEqual([])
    expect(lesson?.labels).toEqual([{ label: 'site name', kept: 0, deleted: 1 }])
  })

  it('skips a page with too little text of its own to be known again', async () => {
    const short: Line[] = [['Remarks', 50, 60], ['Signed', 50, 100]]
    const lesson = await lessonFor(fakePdf(short), [{ source: 1 }], session([site], [drawn]))
    expect(lesson?.pages).toEqual([])
  })

  it('gives a remembered group new ids, the same for all its members', async () => {
    const group = { id: 'g1', mode: 'single' as const }
    const boxes = [field('y', 'Yes', 'checkbox', 0.5, 0.11, { group }), field('n', 'No', 'checkbox', 0.6, 0.11, { group })]
    const lesson = (await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([], boxes)))!
    const back = (await learnedFor([lesson], fakePdf(REPORT, FLOOR), [1, 2], 2))!.remembered(1, 1)!
    expect(back[0].group?.id).not.toBe('g1')
    expect(back[0].group?.id).toBe(back[1].group?.id)
  })
})

describe('label lessons', () => {
  const learn = async (lessons: Lesson[]) => (await learnedFor(lessons, fakePdf(), [], 1))!
  const remarks = field('r', 'Remarks', 'text', 0.1, 0.5)

  it('gives a label what the admin gave it, in every form', async () => {
    const lesson = await lessonOf(session([remarks], [{ ...remarks, type: 'textarea', required: true }]))
    expect(lesson.labels).toEqual([{ label: 'remarks', kept: 1, deleted: 0, change: { type: 'textarea', required: true } }])
    const s = (await learn([lesson])).adjust({ ...field('x', 'REMARKS:', 'text', 0.2, 0.2) })
    expect([s?.type, s?.required, s?.label]).toEqual(['textarea', true, 'REMARKS:'])
  })

  it('learns the value every kept one ends with, whatever each started as', async () => {
    const a = field('a', 'Remarks', 'text', 0.1, 0.5)
    const b = field('b', 'Remarks', 'textarea', 0.1, 0.6)
    const lesson = await lessonOf(session([a, b], [{ ...a, type: 'textarea' }, b]))
    expect(lesson.labels[0].change).toEqual({ type: 'textarea' })
  })

  it('learns nothing from a label the admin set up in two ways', async () => {
    const a = field('a', 'Date', 'date', 0.1, 0.5)
    const b = field('b', 'Date', 'date', 0.1, 0.6)
    const lesson = await lessonOf(session([a, b], [{ ...a, type: 'datetime' }, b]))
    expect(lesson.labels[0].change).toBeUndefined()
  })

  it('follows a rename to what was learnt under the new name', async () => {
    const sig = field('a', 'Name – Signature', 'text', 0.1, 0.5)
    const one = await lessonOf(session([sig], [{ ...sig, label: "Manager's name" }]), 1)
    const named = field('b', "Manager's name", 'text', 0.1, 0.5)
    const two = await lessonOf(session([named], [{ ...named, type: 'dropdown', options: ['A. Smith', 'B. Jones'] }]), 2)
    const s = (await learn([two, one])).adjust(field('x', 'Name – Signature', 'text', 0.1, 0.5))
    expect([s?.label, s?.type, s?.options]).toEqual(["Manager's name", 'dropdown', ['A. Smith', 'B. Jones']])
  })

  it('leaves out what was deleted in the last two forms, until it is kept again', async () => {
    const desc = field('d', 'Description', 'text', 0.1, 0.5)
    const deleted = (n: number) => lessonOf({ ...session([desc], []), id: `d${n}` }, n)
    const kept = await lessonOf({ ...session([desc], [desc]), id: 'k' }, 3)
    expect((await learn([await deleted(1)])).adjust(desc)).not.toBeNull()
    expect((await learn([await deleted(1), await deleted(2)])).adjust(desc)).toBeNull()
    expect((await learn([await deleted(1), await deleted(2), kept])).adjust(desc)).not.toBeNull()
    // No longer suggested, so it cannot be kept: drawing it by hand says it is wanted.
    const byHand = { ...field('h', 'Description', 'textarea', 0.1, 0.7), source: 'manual' as const }
    const drawn = await lessonOf({ ...session([], [byHand]), id: 'h' }, 3)
    expect(drawn.labels).toEqual([{ label: 'description', kept: 1, deleted: 0 }])
    expect((await learn([await deleted(1), await deleted(2), drawn])).adjust(desc)).not.toBeNull()
  })

  it('takes a field drawn in place of a deleted suggestion as a change', async () => {
    const role = field('r', 'Role', 'text', 0.1, 0.5)
    const drawn = { ...field('m', 'Dropdown', 'dropdown', 0.1, 0.5), source: 'manual' as const, options: ['Manager', 'Supervisor'] }
    const lesson = await lessonOf(session([role], [drawn]))
    expect(lesson.labels).toEqual([
      { label: 'role', kept: 1, deleted: 0, change: { type: 'dropdown', options: ['Manager', 'Supervisor'] } },
    ])
  })

  it('learns nothing from a session that deleted every suggestion (starting again)', async () => {
    const many = Array.from({ length: 12 }, (_, i) => field(`f${i}`, `Item ${i}`, 'text', 0.1, i * 0.05))
    expect(await lessonFor(fakePdf([['x', 0, 0]]), [], session(many, []))).toBeNull()
  })

  it('never learns from a box without a label', async () => {
    const box = field('c', 'checkbox', 'checkbox', 0.1, 0.5) // what auto-detect calls a box it found no name for
    const row = field('n', '12', 'text', 0.1, 0.6)
    expect(await lessonFor(fakePdf([['x', 0, 0]]), [], session([box, row], []))).toBeNull()
  })

  it('does not apply a change that makes no valid field', async () => {
    const lesson: Lesson = { version: 1, id: 'x', at: 1, labels: [{ label: 'role', kept: 1, deleted: 0, change: { type: 'dropdown' } }], pages: [] }
    const s = field('r', 'Role', 'text', 0.1, 0.5)
    expect((await learn([lesson])).adjust(s)).toBe(s) // a dropdown needs options
  })
})

describe('storing lessons', () => {
  const lesson = (id: string, at: number): Lesson => ({ version: 1, id, at, labels: [], pages: [] })

  it('addLesson replaces the lesson with the same id and keeps the newest', () => {
    const list = addLesson([lesson('a', 1), lesson('b', 2)], lesson('a', 3))
    expect(list.map((l) => `${l.id}${l.at}`)).toEqual(['b2', 'a3'])
    expect(addLesson(list, lesson('c', 4), 2).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('validateLesson accepts what lessonFor makes and refuses anything else', () => {
    expect(validateLesson(lesson('a', 1))).toEqual([])
    expect(validateLesson(null)).toEqual(['A lesson must be an object'])
    expect(validateLesson({ ...lesson('a', 1), version: 2 })).toContain('version must be 1')
    const badChange = { ...lesson('a', 1), labels: [{ label: 'x', kept: 1, deleted: 0, change: { onClick: 'alert(1)' } }] }
    expect(validateLesson(badChange)).toHaveLength(1)
    const badType = { ...lesson('a', 1), labels: [{ label: 'x', kept: 1, deleted: 0, change: { type: 'script' } }] }
    expect(validateLesson(badType)).toHaveLength(1)
    const field = { settings: { type: 'dropdown', label: 'Role' }, box: [0.1, 0.1, 0.2, 0.02] }
    const noOptions = { ...lesson('a', 1), pages: [{ text: [['abc', 0.1, 0.1]], fields: [field] }] }
    expect(validateLesson(noOptions)[0]).toMatch(/Page 1: .*option/)
    const outside = { ...lesson('a', 1), pages: [{ text: [], fields: [{ ...field, settings: { type: 'text', label: 'A' }, box: [0.9, 0.1, 0.5, 0.1] }] }] }
    expect(validateLesson(outside)[0]).toMatch(/Page 1: .*inside a page/)
  })

  it('detection skips a lesson that is not valid', async () => {
    const bad = { version: 1, id: 'x', at: 1, labels: [{ label: 'role', kept: 'yes' }], pages: [] } as unknown as Lesson
    expect(await learnedFor([bad], fakePdf(), [], 1)).toBeNull()
  })
})

// The whole round trip on a real PDF: detect, change, save, detect again.
describe('on a real PDF', () => {
  async function load(file: string) {
    const data = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', file)))
    const pdf = await getDocument({ data }).promise
    const v = (await pdf.getPage(1)).view
    return { pdf, pages: [{ source: 1, width: v[2] - v[0], height: v[3] - v[1] }] }
  }
  // The same field: type, label, options and a box within 0.001 of the page.
  const near = (a: FieldDef, b: FieldDef) =>
    a.type === b.type &&
    a.label === b.label &&
    JSON.stringify(a.options) === JSON.stringify(b.options) &&
    (['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(a.position[k] - b.position[k]) < 0.001)

  it('puts the saved page back, and applies the label lessons alone where the page is new', async () => {
    const { pdf, pages } = await load('big_14pt_landscape.pdf')
    const suggested = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [])
    const saved = [
      ...suggested
        .filter((f) => f.label !== 'No')
        .map((f) => (f.label === 'Site name' ? { ...f, type: 'dropdown' as const, options: ['Site Alpha', 'Site Beta'] } : f)),
      field('m', 'Inspector', 'text', 0.5, 0.6, { source: 'manual' }),
    ]
    const lesson = JSON.parse(JSON.stringify(await lessonFor(pdf, pages, session(suggested, saved)))) as Lesson
    expect(validateLesson(lesson)).toEqual([])

    const again = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [], undefined, undefined, [lesson])
    expect(again).toHaveLength(saved.length)
    for (const f of saved) expect(again.some((g) => near(g, f)), f.label).toBe(true)
    expect(again.every((f) => f.confidence === REMEMBERED)).toBe(true)

    // Without the page memory: suggestions as detected, with what was learnt about their labels.
    const labelsOnly = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [], undefined, undefined, [
      { ...lesson, pages: [] },
    ])
    expect(labelsOnly.find((f) => f.label === 'Site name')).toMatchObject({ type: 'dropdown', options: ['Site Alpha', 'Site Beta'] })
    expect(labelsOnly.some((f) => f.label === 'No')).toBe(true) // deleted once: still suggested
  })
})
