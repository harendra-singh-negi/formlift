// @vitest-environment node
// Pattern learning, measured on synthetic forms (fixtures/forms.ts): an admin sets up some forms, and auto-detect is
// scored on forms that share no label, question or item with them. `npm run eval` prints the full report.
import { describe, expect, it } from 'vitest'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectDocument, lessonFor, type Ops } from '../detect'
import { makeForm, type FormOptions, type Style } from '../fixtures/forms'
import { benchmark, corrected, score, total, type Score } from '../fixtures/bench'
import { forgetting, learnt, validateLesson, type Lesson } from '.'

const forms = (n: number, from: number, words: 'train' | 'test', styles?: Style[]): FormOptions[] =>
  Array.from({ length: n }, (_, i) => ({ seed: from + i, words, ...(styles && { styles }) }))
const report = process.env.npm_lifecycle_event === 'eval'
const row = (s: Omit<Score, 'form'>) =>
  `${String(s.corrections).padStart(4)} corrections: ${s.wrong} to delete, ${s.missed} to draw, ${s.types} types, ${s.groups} groups (${s.right}/${s.fields} in place)`

async function open(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const v = (await pdf.getPage(i)).view
    pages.push({ source: i, width: v[2] - v[0], height: v[3] - v[1] })
  }
  return { pdf, pages }
}
const detect = async (bytes: Uint8Array, lessons: Lesson[] = []) => {
  const { pdf, pages } = await open(bytes)
  return detectDocument(pdf as never, OPS as unknown as Ops, pages, [], undefined, undefined, lessons)
}

describe('pattern learning on forms it has never seen', () => {
  it('needs far fewer corrections, and makes nothing worse', async () => {
    const r = await benchmark(forms(8, 100, 'train'), forms(6, 900, 'test'))
    const [before, after] = [total(r.before), total(r.after)]
    if (report) {
      console.log('While the admin sets up 8 forms, one after another:')
      r.learning.forEach((s, i) => console.log(`  form ${i + 1}: ${row(s)}  ${s.form}`))
      console.log('6 forms it has never seen (no label, question or item in common):')
      console.log(`  without lessons: ${row(before)}`)
      console.log(`  with lessons:    ${row(after)}`)
      console.log(`  made worse: ${r.worse.dropped} right boxes dropped, ${r.worse.retyped} right types changed`)
    }
    expect(before.corrections).toBeGreaterThan(60)
    expect(after.corrections).toBeLessThanOrEqual(before.corrections * 0.2)
    // Answers printed in place of boxes and filled input boxes: never suggested by the rules, now found.
    expect(after.missed).toBe(0)
    // Y / N / NA answered as one question.
    expect(after.groups).toBe(0)
    // Bullets made of small squares: suggested as checkboxes by the rules, left out now.
    expect(after.wrong).toBeLessThan(before.wrong)
    expect(r.worse).toEqual({ dropped: 0, retyped: 0 })
  }, 120_000)

  it('carries over from a single save', async () => {
    const r = await benchmark(forms(1, 100, 'train'), forms(6, 900, 'test'))
    expect(total(r.after).corrections).toBeLessThan(total(r.before).corrections * 0.5)
    expect(r.worse).toEqual({ dropped: 0, retyped: 0 })
  }, 60_000)

  it('learns where admins draw fields that nothing was proposed for, and draws them under other questions', async () => {
    // Questions answered in the blank space under them: nothing drawn there, so the admin draws every field.
    const r = await benchmark(forms(3, 100, 'train', ['open', 'grid']), forms(4, 900, 'test', ['open', 'lines']))
    const [before, after] = [total(r.before), total(r.after)]
    if (report) {
      console.log('Fields drawn by hand where nothing is drawn on the page, 3 forms set up, 4 never seen:')
      r.learning.forEach((s, i) => console.log(`  form ${i + 1}: ${row(s)}  ${s.form}`))
      console.log(`  without lessons: ${row(before)}`)
      console.log(`  with lessons:    ${row(after)}`)
    }
    expect(r.lessons.some((l) => l.places?.length)).toBe(true)
    expect(before.missed).toBeGreaterThanOrEqual(16)
    expect(after.missed).toBeLessThanOrEqual(before.missed * 0.25)
    expect(after.wrong).toBe(before.wrong)
    expect(r.worse).toEqual({ dropped: 0, retyped: 0 })
    // Forgotten with the patterns.
    const form = await makeForm({ seed: 900, words: 'test', styles: ['open', 'lines'] })
    expect(score(form, await detect(form.bytes, [...r.lessons, forgetting({ patterns: true }, 99)]))).toEqual(r.before[0])
  }, 120_000)

  it('changes nothing in layouts it was not shown', async () => {
    const r = await benchmark(forms(4, 100, 'train', ['grid', 'lines']), forms(4, 900, 'test', ['yesNo', 'printed']))
    expect(total(r.after)).toEqual(total(r.before))
  }, 60_000)
})

describe('lessons that teach patterns', () => {
  async function taught() {
    const form = await makeForm({ seed: 7, styles: ['printed', 'grid'], words: 'train' })
    const { pdf, pages } = await open(form.bytes)
    const found = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [])
    const session = { id: 's', before: [], suggested: found, saved: corrected(form, found) }
    return { form, lesson: (await lessonFor(pdf as never, pages, session, { OPS: OPS as unknown as Ops, at: 1 }))! }
  }

  it('keep cues, with the page’s words only as hashes', async () => {
    const { form, lesson } = await taught()
    expect(validateLesson(lesson)).toEqual([])
    expect(lesson.examples!.length).toBeGreaterThan(0)
    expect(lesson.cues).toContain('k=choice')
    // Type names ("rt=phone": the type auto-detect gave a box) are formlift's words, not the page's.
    const text = JSON.stringify(lesson.cues!.filter((c) => !c.startsWith('rt='))).toLowerCase()
    for (const t of form.truth)
      for (const word of t.label.toLowerCase().match(/[a-z]{4,}/g) ?? []) expect(text).not.toContain(word)
  })

  it('are checked: cue indexes in range, known types, nothing else', async () => {
    const { lesson } = await taught()
    const bad = (examples: unknown, cues: unknown = lesson.cues) => validateLesson({ ...lesson, cues, examples })
    expect(bad([{ c: [lesson.cues!.length], y: 1 }])).not.toEqual([])
    expect(bad([{ c: [0], y: 2 }])).not.toEqual([])
    expect(bad([{ c: [0], y: 1, t: 'spaceship' }])).not.toEqual([])
    expect(bad([{ c: [0], y: 1, extra: 1 }])).not.toEqual([])
    expect(bad([{ c: [0], y: 0 }], ['bad cue with spaces'])).not.toEqual([])
    expect(bad([{ c: [0], y: 1, p: 0.3, t: 'text', r: true, g: 'single', n: 3 }])).toEqual([])
  })

  it('are summed up for the Learnt tab, and forgotten', async () => {
    const { lesson } = await taught()
    const other = await makeForm({ seed: 901, styles: ['printed'], words: 'test' })
    const dropdowns = async (lessons: Lesson[]) => (await detect(other.bytes, lessons)).filter((f) => f.type === 'dropdown').length
    expect(learnt([lesson]).patterns).toEqual({ boxes: expect.any(Number), saves: 1 })
    expect(await dropdowns([])).toBe(0)
    expect(await dropdowns([lesson])).toBe(other.truth.length)
    const forgot = [lesson, forgetting({ patterns: true }, 2)]
    expect(learnt(forgot).patterns).toEqual({ boxes: 0, saves: 0 })
    expect(await dropdowns(forgot)).toBe(0)
  })
})
