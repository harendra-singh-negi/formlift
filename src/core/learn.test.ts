// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectDocument, lessonFor as lessonWithDrawing, type Ops } from './detect'
import { validateFields, type FieldDef, type FieldType } from './form-logic'
import {
  addLesson,
  forgetting,
  learnedFor,
  learnt,
  lessonFor,
  LEARNT,
  REMEMBERED,
  validateLesson,
  whyLearnt,
  type EditSession,
  type Lesson,
} from './learn'

// A made-up PDF: pages of text lines [text, x, y] in points (600 × 800, y from the top). It draws nothing.
type Line = [string, number, number]
const fakePdf = (...pages: Line[][]) => ({
  getPage: async (n: number) => ({
    view: [0, 0, 600, 800],
    getTextContent: async () => ({
      items: pages[n - 1].map(([str, x, y]) => ({ str, transform: [10, 0, 0, 10, x, 800 - y], width: str.length * 5 })),
    }),
    getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
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
const session = (suggested: FieldDef[], saved: FieldDef[], before: FieldDef[] = [], id = 's'): EditSession => ({
  id,
  before,
  suggested,
  saved,
})
const lessonOf = async (s: EditSession, at = 1) => (await lessonFor(fakePdf([['x', 0, 0]]), [], s, { at }))!
const json = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as T
const detect = (pdf: unknown, pages: number, lessons: Lesson[]) =>
  detectDocument(
    pdf as never,
    OPS as unknown as Ops,
    Array.from({ length: pages }, (_, i) => ({ source: i + 1, width: 600, height: 800 })),
    [],
    undefined,
    undefined,
    lessons,
  )

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
    const lesson = json(await teach())
    // Revision 2: a line added after "Permit number:" pushes the lines under it 40 pt down.
    const revised: Line[] = [...REPORT.slice(0, 3), ['Call sign:', 50, 180], ['Manager:', 50, 220], ['Date of inspection:', 50, 260]]
    const learned = (await learnedFor([lesson!], fakePdf(revised, FLOOR), [1, 2], 2))!
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
    expect(lesson?.labels).toEqual([{ label: 'Site name', kept: 0, deleted: 1 }])
  })

  it('skips a page with too little text of its own (and no picture) to be known again', async () => {
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

  it('keeps a sample of the lines of a page with many, and still knows the page by it', async () => {
    const many: Line[] = Array.from({ length: 40 }, (_, i) => [`Question ${i + 1}: what was checked`, 50, 40 + i * 18])
    const lesson = json((await lessonFor(fakePdf(many), [{ source: 1 }], session([], [drawn])))!)
    expect([lesson.pages[0].text.length, lesson.pages[0].lines]).toEqual([24, 40])
    expect((await learnedFor([lesson], fakePdf(many), [1], 1))!.remembered(1, 1)).toHaveLength(1)
    // Half of its lines another page's: not this page.
    const half = many.map(([t, x, y], i): Line => [i % 2 ? `Other ${i}` : t, x, y])
    expect((await learnedFor([lesson], fakePdf(half), [1], 1))!.remembered(1, 1)).toBeNull()
  })

  it('is not taken for a page with the same text whose boxes and lines changed', async () => {
    // Both fields sat on the page's drawing when it was saved.
    const onLines = async () => () => true
    const lesson = (await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([site], saved), { drawing: onLines }))!
    expect(lesson.pages[0].onDrawing).toEqual([0, 1])
    const learned = (await learnedFor([lesson], fakePdf(REPORT, FLOOR), [1, 2], 2))!
    expect(learned.remembered(1, 1, () => true)).toHaveLength(2)
    expect(learned.remembered(1, 1, () => false)).toBeNull()
  })
})

describe('conditions and follow-ups', () => {
  const yesNo = { type: 'dropdown' as const, options: ['Yes', 'No'] }
  const when = (key: string) => ({ logic: 'and' as const, rules: [{ fieldKey: key, op: 'equals' as const, value: 'Yes' }] })
  const defects = field('d', 'Any defects', 'dropdown', 0.4, 0.11, {
    ...yesNo,
    followUp: { when: when('d'), fields: ['why'] },
  })
  const why = field('why', 'What is wrong', 'textarea', 0.4, 0.4, { dialogOnly: true })
  const details = field('t', 'Details', 'textarea', 0.4, 0.17, { visibleWhen: when('d') })
  const hatch = field('h', 'Hatch covers checked', 'checkbox', 0.6, 0.12, {
    position: { page: 2, x: 0.6, y: 0.12, width: 0.03, height: 0.02 },
    requiredWhen: when('d'),
  })
  const saved = [defects, why, details, hatch]

  it('come back with the page, pointing at the fields they were set up with', async () => {
    const lesson = json((await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([], saved)))!)
    expect(validateLesson(lesson)).toEqual([])
    const found = await detect(fakePdf(REPORT, FLOOR), 2, [lesson])
    expect(validateFields(found, 2)).toEqual([])
    const key = (label: string) => found.find((f) => f.label === label)!.key
    const by = (label: string) => found.find((f) => f.label === label)!
    expect(by('Details').visibleWhen?.rules).toEqual([{ fieldKey: key('Any defects'), op: 'equals', value: 'Yes' }])
    expect(by('Hatch covers checked').requiredWhen?.rules).toEqual([{ fieldKey: key('Any defects'), op: 'equals', value: 'Yes' }])
    expect(by('Any defects').followUp?.fields).toEqual([key('What is wrong')])
    expect(by('What is wrong').dialogOnly).toBe(true)
  })

  it('leave out a condition whose field did not come back', async () => {
    const lesson = (await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([], saved)))!
    // Page 1 is another page now: only the floor page comes back, without the condition on "Any defects".
    const other: Line[] = [['Another form', 50, 60], ['Address:', 50, 100], ['Agent:', 50, 140], ['Owner:', 50, 180]]
    const found = await detect(fakePdf(other, FLOOR), 2, [lesson])
    expect(found.map((f) => [f.label, f.requiredWhen])).toEqual([['Hatch covers checked', undefined]])
  })

  it('leave out a follow-up question whose field was not put back', async () => {
    const lesson = (await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([], saved)))!
    // A field is already where "Any defects" was: it does not come back, nor does the question it asked.
    const there = { ...defects, id: 'x', key: 'x', followUp: undefined }
    const pages = [1, 2].map((source) => ({ source, width: 600, height: 800 }))
    const found = await detectDocument(fakePdf(REPORT, FLOOR) as never, OPS as unknown as Ops, pages, [there], undefined, undefined, [lesson])
    expect(found.map((f) => f.label).sort()).toEqual(['Details', 'Hatch covers checked'])
    expect(found.every((f) => !f.visibleWhen && !f.requiredWhen)).toBe(true)
  })

  it('remember the page of a field a changed page uses', async () => {
    // Only the floor page changed: its new condition uses "Any defects" on the first page, set up before.
    const lesson = (await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([], saved, [defects, why, details])))!
    expect(lesson.pages.map((p) => p.fields.length)).toEqual([3, 1])
  })
})

describe('fields drawn by hand', () => {
  const FORM: Line[] = [['Inspection', 50, 40], ['Inspector:', 50, 100], ['Weather', 50, 160]]
  // Right of "Inspector:" (which ends at 100 pt), on its row: 10 pt after it, 150 pt wide.
  const name = { ...field('m', 'Inspector name', 'text', 110 / 600, 90 / 800), source: 'manual' as const }
  name.position = { ...name.position, width: 150 / 600, height: 14 / 800 }
  const teach = (id: string, at: number, f: FieldDef = name) =>
    lessonFor(fakePdf(FORM), [{ source: 1 }], session([], [f], [], id), { at }) as Promise<Lesson>
  const elsewhere = (...more: Line[]): Line[] => [['Another form', 50, 40], ['Inspector:', 300, 400], ...more]

  it('are drawn next to the same line in other forms once drawn there in two', async () => {
    const one = await teach('a', 1)
    expect(one.drawn).toEqual([{ line: expect.any(String), side: 'right', box: [10, -0.8, 150, 14], settings: { type: 'text', label: 'Inspector name' } }])
    expect(JSON.stringify(one.drawn)).not.toContain('Inspector:') // the line: only its hash
    const pdf = fakePdf(elsewhere())
    expect((await learnedFor([one], pdf, [1], 1))!.drawn(1, 1, [])).toEqual([])
    const both = (await learnedFor([one, await teach('b', 2)], pdf, [1], 1))!.drawn(1, 1, [])
    expect(both.map((f) => [f.label, f.type, f.confidence])).toEqual([['Inspector name', 'text', LEARNT]])
    // 10 pt after "Inspector:" (300 + 50 pt wide), on its row.
    expect(at(both)).toEqual([[0.6, 0.488]])
    expect(both[0].position.width).toBeCloseTo(0.25)
  })

  it('are narrower where the form has less room, and left out where it has text', async () => {
    const lessons = [await teach('a', 1), await teach('b', 2)]
    const room = (await learnedFor(lessons, fakePdf(elsewhere(['Notes', 450, 400])), [1], 1))!.drawn(1, 1, [])
    expect(room[0].position.width * 600).toBeCloseTo(87) // up to 3 pt before "Notes"
    expect((await learnedFor(lessons, fakePdf(elsewhere(['Notes', 370, 400])), [1], 1))!.drawn(1, 1, [])).toEqual([])
    // Nor under a line where the form has text: drawn under "Remarks" once, the other form writes there.
    const remarks: Line[] = [['Inspection', 50, 40], ['Remarks', 50, 300]]
    const under = { ...name, label: 'Remarks', position: { page: 1, x: 50 / 600, y: 320 / 800, width: 300 / 600, height: 60 / 800 } }
    const twice = [
      await lessonFor(fakePdf(remarks), [{ source: 1 }], session([], [under], [], 'c'), { at: 1 }),
      await lessonFor(fakePdf(remarks), [{ source: 1 }], session([], [under], [], 'd'), { at: 2 }),
    ] as Lesson[]
    expect(twice[0].drawn?.[0].side).toBe('below')
    expect((await learnedFor(twice, fakePdf(remarks), [1], 1))!.drawn(1, 1, [])).toHaveLength(1)
    const written: Line[] = [...remarks, ['No defects were found on the site.', 40, 345]]
    expect((await learnedFor(twice, fakePdf(written), [1], 1))!.drawn(1, 1, [])).toEqual([])
    // Nor where a field is already.
    const taken = [{ page: 1, x: 0.6, y: 0.49, width: 0.2, height: 0.02 }]
    expect((await learnedFor(lessons, fakePdf(elsewhere()), [1], 1))!.drawn(1, 1, taken)).toEqual([])
  })

  it('are named after their line when the admin did not name them', async () => {
    const plain = { ...name, label: 'Text' }
    const lessons = [await teach('a', 1, plain), await teach('b', 2, plain)]
    const back = (await learnedFor(lessons, fakePdf(elsewhere()), [1], 1))!.drawn(1, 1, [])
    expect(back.map((f) => f.label)).toEqual(['Inspector'])
  })
})

describe('scanned pages', () => {
  it('are known again by their picture', async () => {
    const file = path.join(__dirname, 'fixtures', 'scanned.pdf')
    const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise
    const box = { ...field('s', 'Inspector', 'text', 0.34, 0.13), source: 'manual' as const }
    const lesson = json((await lessonFor(pdf, PAGES, session([], [box])))!)
    expect(lesson.pages[0].text).toEqual([])
    expect(lesson.pages[0].image).toMatch(/^[0-9a-f]{256}$/)
    expect(validateLesson(lesson)).toEqual([])
    const back = await detect(pdf, 2, [lesson])
    expect(back.map((f) => [f.position.page, f.label, f.confidence])).toEqual([[1, 'Inspector', REMEMBERED]])
    // The other page of the scan is another page.
    const learned = (await learnedFor([lesson], pdf, [2], 1))!
    expect(learned.remembered(2, 1)).toBeNull()
    // Two copies of the page in one document: the memory goes to one of them, not to every page like it.
    const twice = await PDFDocument.create()
    const src = await PDFDocument.load(fs.readFileSync(file))
    for (const p of await twice.copyPages(src, [0, 0])) twice.addPage(p)
    const copies = await getDocument({ data: await twice.save(), verbosity: 0 }).promise
    expect((await detect(copies, 2, [lesson])).map((f) => f.position.page)).toEqual([1])
  })
})

describe('label lessons', () => {
  const learn = async (lessons: Lesson[]) => (await learnedFor(lessons, fakePdf(), [], 1))!
  const remarks = field('r', 'Remarks', 'text', 0.1, 0.5)

  it('gives a label what the admin gave it, in every form', async () => {
    const lesson = await lessonOf(session([remarks], [{ ...remarks, type: 'textarea', required: true }]))
    expect(lesson.labels).toEqual([{ label: 'Remarks', kept: 1, deleted: 0, change: { type: 'textarea', required: true } }])
    const s = (await learn([lesson])).adjust({ ...field('x', 'REMARKS:', 'text', 0.2, 0.2) })
    expect([s?.type, s?.required, s?.label, s?.confidence]).toEqual(['textarea', true, 'REMARKS:', LEARNT])
  })

  it('keeps a label kept as suggested only as its hash', async () => {
    const lesson = await lessonOf(session([remarks], [remarks]))
    expect([lesson.labels, lesson.kept?.length]).toEqual([[], 1])
    expect(JSON.stringify(lesson)).not.toMatch(/remarks/i)
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
    expect(lesson.labels).toEqual([])
    expect(lesson.kept).toHaveLength(1)
  })

  it('follows a rename to what was learnt under the new name', async () => {
    const sig = field('a', 'Name – Signature', 'text', 0.1, 0.5)
    const one = await lessonOf(session([sig], [{ ...sig, label: "Manager's name" }]), 1)
    const named = field('b', "Manager's name", 'text', 0.1, 0.5)
    const two = await lessonOf(session([named], [{ ...named, type: 'dropdown', options: ['A. Smith', 'B. Jones'] }]), 2)
    const s = (await learn([two, one])).adjust(field('x', 'Name – Signature', 'text', 0.1, 0.5))
    expect([s?.label, s?.type, s?.options]).toEqual(["Manager's name", 'dropdown', ['A. Smith', 'B. Jones']])
    expect(s?.why?.labels).toHaveLength(2) // forgetting it forgets both
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
    expect(drawn.kept).toHaveLength(1)
    expect((await learn([await deleted(1), await deleted(2), drawn])).adjust(desc)).not.toBeNull()
  })

  it('takes a field drawn in place of a deleted suggestion as a change', async () => {
    const role = field('r', 'Role', 'text', 0.1, 0.5)
    const drawn = { ...field('m', 'Dropdown', 'dropdown', 0.1, 0.5), source: 'manual' as const, options: ['Manager', 'Supervisor'] }
    const lesson = await lessonOf(session([role], [drawn]))
    expect(lesson.labels).toEqual([
      { label: 'Role', kept: 1, deleted: 0, change: { type: 'dropdown', options: ['Manager', 'Supervisor'] } },
    ])
    expect(lesson.drawn).toBeUndefined() // a change of the suggestion, not a field of its own
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
    const lesson: Lesson = { version: 1, id: 'x', at: 1, labels: [{ label: 'Role', kept: 1, deleted: 0, change: { type: 'dropdown' } }], pages: [] }
    const s = field('r', 'Role', 'text', 0.1, 0.5)
    expect((await learn([lesson])).adjust(s)).toBe(s) // a dropdown needs options
  })
})

describe('forgetting', () => {
  const remarks = field('r', 'Remarks', 'text', 0.1, 0.5)
  const desc = field('d', 'Description', 'text', 0.1, 0.6)
  const teach = () =>
    lessonOf(session([remarks, desc], [{ ...remarks, type: 'textarea' }]), 1).then((l) => [l, { ...l, id: 'again', at: 2 }])
  const adjust = async (lessons: Lesson[], s: FieldDef) => (await learnedFor(lessons, fakePdf(), [], 1))!.adjust(s)

  it('lists what was learnt, and forgets a label or everything', async () => {
    const lessons = await teach()
    expect(learnt(lessons)).toMatchObject({
      labels: [
        { label: 'Remarks', drop: false, change: { type: 'textarea' } },
        { label: 'Description', drop: true, change: {} },
      ],
      drawn: [],
      pages: 0,
    })
    const [remarksRule] = learnt(lessons).labels
    const noRemarks = [...lessons, forgetting({ labels: [remarksRule.hash] }, 3)]
    expect(learnt(noRemarks).labels.map((l) => l.label)).toEqual(['Description'])
    expect((await adjust(noRemarks, remarks))?.type).toBe('text')
    expect(await adjust(noRemarks, desc)).toBeNull()
    const nothing = [...lessons, forgetting({ all: true }, 3)]
    expect(learnt(nothing)).toEqual({ labels: [], drawn: [], pages: 0 })
    expect(await adjust(nothing, desc)).not.toBeNull()
    // What is learnt after it counts again.
    const later = await lessonOf({ ...session([remarks], [{ ...remarks, type: 'textarea' }]), id: 'later' }, 4)
    expect((await adjust([...nothing, later], remarks))?.type).toBe('textarea')
  })

  it('tells what to forget to undo a suggestion, and forgets the page with it', async () => {
    const site = field('a', 'Site name', 'text', 0.25, 0.11)
    const lesson = json((await lessonFor(fakePdf(REPORT, FLOOR), PAGES, session([site], [{ ...site, label: 'Location' }])))!)
    const back = await detect(fakePdf(REPORT, FLOOR), 2, [lesson])
    const why = whyLearnt(back[0])!
    expect(why).toEqual({ pages: [[lesson.id, 0]] })
    expect(await detect(fakePdf(REPORT, FLOOR), 2, [lesson, forgetting(why, 2)])).toEqual([])
  })

  it('leaves out of a later save what was forgotten in the session', async () => {
    const forgotten = { labels: learnt(await teach()).labels.map((l) => l.hash) }
    const again = await lessonFor(fakePdf([['x', 0, 0]]), [], session([remarks, desc], [{ ...remarks, type: 'textarea' }]), { forgotten })
    expect(again).toBeNull()
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
    expect(validateLesson(forgetting({ all: true, labels: ['abc'], pages: [['x', 0]] }))).toEqual([])
    expect(validateLesson(null)).toEqual(['A lesson must be an object'])
    expect(validateLesson({ ...lesson('a', 1), version: 2 })).toContain('version must be 1')
    const badChange = { ...lesson('a', 1), labels: [{ label: 'x', kept: 1, deleted: 0, change: { onClick: 'alert(1)' } }] }
    expect(validateLesson(badChange)).toHaveLength(1)
    const badType = { ...lesson('a', 1), labels: [{ label: 'x', kept: 1, deleted: 0, change: { type: 'script' } }] }
    expect(validateLesson(badType)).toHaveLength(1)
    const f = { settings: { type: 'dropdown', label: 'Role' }, box: [0.1, 0.1, 0.2, 0.02] }
    const noOptions = { ...lesson('a', 1), pages: [{ text: [['abc', 0.1, 0.1]], fields: [f] }] }
    expect(validateLesson(noOptions)[0]).toMatch(/Page 1: .*option/)
    const outside = { ...lesson('a', 1), pages: [{ text: [], fields: [{ ...f, settings: { type: 'text', label: 'A' }, box: [0.9, 0.1, 0.5, 0.1] }] }] }
    expect(validateLesson(outside)[0]).toMatch(/Page 1: .*inside a page/)
    const text = { settings: { type: 'text', label: 'A' }, box: [0.1, 0.1, 0.2, 0.02] }
    const when = { logic: 'and', rules: [{ fieldKey: 'p3_0', op: 'equals', value: 'x' }] }
    const unknown = { ...lesson('a', 1), pages: [{ text: [], fields: [{ ...text, visibleWhen: when }] }] }
    expect(validateLesson(unknown)[0]).toMatch(/Conditions: .*unknown field "p3_0"/)
    const drawn = { line: 'abc', side: 'left', box: [1, 1, 100, 10], settings: { type: 'text', label: 'A' } }
    expect(validateLesson({ ...lesson('a', 1), drawn: [drawn] })[0]).toMatch(/Drawn field 1/)
    expect(validateLesson({ ...lesson('a', 1), forget: { pages: [[1, 'x']] } })[0]).toMatch(/forget/)
    expect(validateLesson({ ...lesson('a', 1), pages: [{ text: [], image: 'xyz', fields: [text] }] })[0]).toMatch(/Page 1/)
  })

  it('detection skips a lesson that is not valid', async () => {
    const bad = { version: 1, id: 'x', at: 1, labels: [{ label: 'role', kept: 'yes' }], pages: [] } as unknown as Lesson
    expect(await learnedFor([bad], fakePdf(), [], 1)).toBeNull()
  })
})

// The whole round trip on a real PDF: detect, change, save, detect again.
describe('on a real PDF', () => {
  async function load(file: string | Uint8Array) {
    const data = typeof file === 'string' ? new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', file))) : file
    const pdf = await getDocument({ data, verbosity: 0 }).promise
    const v = (await pdf.getPage(1)).view
    return { pdf, pages: [{ source: 1, width: v[2] - v[0], height: v[3] - v[1] }] }
  }
  const run = (pdf: unknown, pages: { source: number; width: number; height: number }[], lessons?: Lesson[]) =>
    detectDocument(pdf as never, OPS as unknown as Ops, pages, [], undefined, undefined, lessons)
  // The same field: type, label, options and a box within 0.001 of the page.
  const near = (a: FieldDef, b: FieldDef) =>
    a.type === b.type &&
    a.label === b.label &&
    JSON.stringify(a.options) === JSON.stringify(b.options) &&
    (['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(a.position[k] - b.position[k]) < 0.001)

  it('puts the saved page back, and applies the label lessons alone where the page is new', async () => {
    const { pdf, pages } = await load('big_14pt_landscape.pdf')
    const suggested = await run(pdf, pages)
    const saved = [
      ...suggested
        .filter((f) => f.label !== 'No')
        .map((f) => (f.label === 'Site name' ? { ...f, type: 'dropdown' as const, options: ['Site Alpha', 'Site Beta'] } : f)),
      field('m', 'Inspector', 'text', 0.5, 0.6, { source: 'manual' }),
    ]
    const lesson = json(await lessonWithDrawing(pdf, pages, session(suggested, saved), { OPS: OPS as unknown as Ops }))!
    expect(validateLesson(lesson)).toEqual([])
    expect(lesson.pages[0].onDrawing?.length).toBeGreaterThanOrEqual(2) // the boxes it found sit on the page's lines

    const again = await run(pdf, pages, [lesson])
    expect(again).toHaveLength(saved.length)
    for (const f of saved) expect(again.some((g) => near(g, f)), f.label).toBe(true)
    expect(again.every((f) => f.confidence === REMEMBERED)).toBe(true)

    // Without the page memory: suggestions as detected, with what was learnt about their labels.
    const labelsOnly = await run(pdf, pages, [{ ...lesson, pages: [] }])
    expect(labelsOnly.find((f) => f.label === 'Site name')).toMatchObject({ type: 'dropdown', options: ['Site Alpha', 'Site Beta'] })
    expect(labelsOnly.some((f) => f.label === 'No')).toBe(true) // deleted once: still suggested
  })

  it('does not take a page with the same text but other boxes for the one set up before', async () => {
    // Two forms with the same lines: answer lines after them in the first, under them in the second.
    async function form(under: boolean) {
      const doc = await PDFDocument.create()
      const page = doc.addPage([595, 842])
      const font = await doc.embedFont(StandardFonts.Helvetica)
      ;['Name of the inspector:', 'Place of inspection:', 'Equipment checked:', 'Signature of the manager:'].forEach((t, i) => {
        const y = 760 - i * 90
        page.drawText(t, { x: 50, y, size: 11, font })
        const [x0, x1, ly] = under ? [50, 300, y - 30] : [200, 520, y - 2]
        page.drawLine({ start: { x: x0, y: ly }, end: { x: x1, y: ly }, thickness: 0.8 })
      })
      return load(await doc.save())
    }
    const a = await form(false)
    const suggested = await run(a.pdf, a.pages)
    expect(suggested).toHaveLength(4)
    const saved = suggested.map((f) => ({ ...f, required: true }))
    const lesson = (await lessonWithDrawing(a.pdf, a.pages, session(suggested, saved), { OPS: OPS as unknown as Ops }))!
    expect((await run(a.pdf, a.pages, [lesson])).every((f) => f.confidence === REMEMBERED)).toBe(true)
    const b = await form(true)
    const got = await run(b.pdf, b.pages, [lesson])
    expect(got.some((f) => f.confidence === REMEMBERED)).toBe(false)
  })
})
