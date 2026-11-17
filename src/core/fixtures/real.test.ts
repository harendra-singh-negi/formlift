// @vitest-environment node
// Learning measured on real forms (`npm run eval:real`): a folder of PDFs, each with the form an admin set up on it,
// `name.pdf` next to `name.json` (the form JSON of the editor's onSave: the demo's step 3 shows it, with Download).
// Each form is scored by the corrections auto-detect still needs once the admin set up all the others, one after
// another (leave one out): without lessons, with all of them, and with patterns only (no page set up before, no
// label, no line: only what carries over to a form it has never seen).
//   FORMLIFT_CORPUS=~/my-forms npm run eval:real
// Without the folder only the reading of a saved form is checked. Keep the folder out of the repository.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { detectDocument, type Ops } from '../detect'
import type { Lesson } from '../learn'
import { benchmark, corrected, detectAndScore, savedForm, score, total, type Score } from './bench'
import { makeForm, type Form } from './forms'

const dir = process.env.FORMLIFT_CORPUS?.replace(/^~(?=\/)/, process.env.HOME ?? '~')
const row = (s: Omit<Score, 'form'>) =>
  `${String(s.corrections).padStart(5)} (${s.wrong} to delete, ${s.missed} to draw, ${s.types} types, ${s.groups} groups)`
// What carries over: the patterns of a lesson, without what it remembers of pages, labels and lines.
const patternsOnly = (l: Lesson): Lesson => ({ ...l, pages: [], labels: [], kept: undefined, drawn: undefined })

describe('a saved form as the truth', () => {
  it('needs no correction when detection finds what was saved', async () => {
    const form = await makeForm({ seed: 5, styles: ['yesNo', 'grid'] })
    const pdf = await getDocument({ data: form.bytes.slice(), verbosity: 0 }).promise
    const v = (await pdf.getPage(1)).view
    const pages = Array.from({ length: pdf.numPages }, (_, i) => ({ source: i + 1, width: v[2] - v[0], height: v[3] - v[1] }))
    const found = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [])
    const fields = corrected(form, found)
    const real = savedForm('saved', form.bytes, JSON.parse(JSON.stringify({ fields, layout: null })))
    expect(real.truth).toHaveLength(form.truth.length)
    expect(score(real, fields).corrections).toBe(0)
    expect(score(real, found)).toEqual({ ...score(form, found), form: 'saved' })
    expect(() => savedForm('moved', form.bytes, { fields, layout: { pages: [{ source: 2 }], elements: [] } })).toThrow(/layout/)
  }, 60_000)
})

describe.skipIf(!dir)('learning on real forms', () => {
  it('scores each form after the admin set up all the others', async () => {
    const forms: Form[] = []
    for (const file of readdirSync(dir!).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
      const name = file.slice(0, -4)
      let saved: unknown
      try {
        saved = JSON.parse(readFileSync(join(dir!, `${name}.json`), 'utf8'))
      } catch {
        console.log(`  skipped ${file}: no ${name}.json next to it`)
        continue
      }
      try {
        forms.push(savedForm(name, new Uint8Array(readFileSync(join(dir!, file))), saved))
      } catch (e) {
        console.log(`  skipped ${(e as Error).message}`)
      }
    }
    console.log(`${forms.length} forms in ${dir}. Each scored after the admin set up the ${forms.length - 1} others:`)
    const all: Record<'before' | 'after' | 'patterns', Score[]> = { before: [], after: [], patterns: [] }
    const harm = { dropped: 0, retyped: 0 }
    for (const [i, form] of forms.entries()) {
      const r = await benchmark(
        forms.filter((_, j) => j !== i),
        [form],
      )
      const patterns = (await detectAndScore(form, r.lessons.map(patternsOnly))).score
      all.before.push(r.before[0])
      all.after.push(r.after[0])
      all.patterns.push(patterns)
      harm.dropped += r.worse.dropped
      harm.retyped += r.worse.retyped
      console.log(`  ${form.name} (${form.truth.length} fields)`)
      console.log(`    without lessons: ${row(r.before[0])}`)
      console.log(`    with lessons:    ${row(r.after[0])}`)
      console.log(`    patterns only:   ${row(patterns)}`)
    }
    if (forms.length) {
      console.log('All forms:')
      console.log(`  without lessons: ${row(total(all.before))}`)
      console.log(`  with lessons:    ${row(total(all.after))}`)
      console.log(`  patterns only:   ${row(total(all.patterns))}`)
      console.log(`  made worse: ${harm.dropped} right boxes dropped, ${harm.retyped} right types changed`)
    }
    expect(forms.length).toBeGreaterThan(1)
  }, 3_600_000)
})
