// @vitest-environment node
// Auto-detect on real PDF files built in different styles (generated with pdf-lib, see fixtures/README.md):
// small 7 pt text with a table of separately drawn cells, large 14 pt landscape with round buttons, a dotted
// line of tiny squares and typed "____", and drawing through a scaled transform. Guards the detector against
// being tuned to one document.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { validateFields } from './form-logic'
import { detectDocument, type Ops } from './detect'

async function detect(file: string) {
  const data = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', file)))
  const pdf = await getDocument({ data }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const v = (await pdf.getPage(i)).view
    pages.push({ source: i, width: v[2] - v[0], height: v[3] - v[1] })
  }
  const fields = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [])
  expect(validateFields(fields, pages.length)).toEqual([])
  return fields.map((f) => `${f.type}: ${f.label}`).sort()
}

describe('auto-detect on different form styles', () => {
  it('small 7 pt form: underline bar, dashed date, small squares, table of cell boxes', async () => {
    expect(await detect('small_7pt.pdf')).toEqual([
      'checkbox: Contract',
      'checkbox: Full time',
      'checkbox: Part time',
      'date: Date',
      'text: Name',
      'textarea: Boots – Quantity',
      'textarea: Boots – Remarks',
      'textarea: Gloves – Quantity',
      'textarea: Gloves – Remarks',
      'textarea: Helmets – Quantity',
      'textarea: Helmets – Remarks',
    ])
  })

  it('large 14 pt landscape: round buttons, dots line, stacked remarks, typed underscores', async () => {
    expect(await detect('big_14pt_landscape.pdf')).toEqual([
      'checkbox: No',
      'checkbox: Yes',
      'signature: Signature',
      'text: Site name',
      'textarea: Remarks',
    ])
  })

  it('drawing through a scaled transform', async () => {
    expect(await detect('scaled.pdf')).toEqual(['checkbox: Checked', 'text: Inspector'])
  })
})

describe("a PDF's own fillable fields", () => {
  it('are taken as they are, named by the text beside them, instead of guessed from the drawing', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([595, 842])
    const form = doc.getForm()
    const say = (text: string, x: number, y: number) => page.drawText(text, { x, y, size: 10, font })
    // Graph-paper lines over the whole page: the drawing alone reads as one big table.
    for (let x = 0; x <= 595; x += 20) page.drawLine({ start: { x, y: 0 }, end: { x, y: 842 }, thickness: 0.3 })
    for (let y = 0; y <= 842; y += 20) page.drawLine({ start: { x: 0, y }, end: { x: 595, y }, thickness: 0.3 })
    say('Full Name', 40, 790)
    const name = form.createTextField('topmostSubform[0].Page1[0].f1_01[0]')
    name.setMaxLength(40)
    name.enableRequired()
    name.addToPage(page, { x: 40, y: 760, width: 240, height: 22 })
    say('Date of joining', 320, 790)
    form.createTextField('doj').addToPage(page, { x: 320, y: 760, width: 200, height: 22 })
    say('Remarks', 40, 720)
    const remarks = form.createTextField('remarks')
    remarks.enableMultiline()
    remarks.addToPage(page, { x: 40, y: 640, width: 480, height: 70 })
    form.createCheckBox('agree').addToPage(page, { x: 40, y: 600, width: 12, height: 12 })
    say('I agree', 58, 602)
    const ok = form.createRadioGroup('ok')
    ok.addOptionToPage('Yes', page, { x: 40, y: 560, width: 12, height: 12 })
    say('Yes', 58, 562)
    ok.addOptionToPage('No', page, { x: 100, y: 560, width: 12, height: 12 })
    say('No', 118, 562)
    say('Rank', 40, 520)
    form.createDropdown('rank').addOptions(['Master', 'Chief Officer'])
    form.getDropdown('rank').addToPage(page, { x: 80, y: 515, width: 150, height: 20 })
    form.createButton('print').addToPage('Print', page, { x: 400, y: 515, width: 60, height: 20 })
    form.createTextField('hidden_one').addToPage(page, { x: 400, y: 400, width: 60, height: 20, hidden: true })

    const pdf = await getDocument({ data: await doc.save() }).promise
    const fields = await detectDocument(pdf as never, OPS as unknown as Ops, [{ source: 1, width: 595, height: 842 }], [])
    expect(validateFields(fields, 1)).toEqual([])
    const by = (label: string) => fields.find((f) => f.label === label)!
    expect(fields.map((f) => `${f.type}: ${f.label}`).sort()).toEqual([
      'checkbox: I agree',
      'checkbox: No',
      'checkbox: Yes',
      'date: Date of joining',
      'dropdown: Rank',
      'text: Full Name',
      'textarea: Remarks',
    ])
    expect(by('Full Name')).toMatchObject({ required: true, maxLength: 40, confidence: 1 })
    expect(by('Full Name').position).toEqual(expect.objectContaining({ x: expect.closeTo(40 / 595, 2), y: expect.closeTo(60 / 842, 2) }))
    expect(by('Rank').options).toEqual(['Master', 'Chief Officer'])
    expect(by('Yes').group).toEqual(by('No').group)
    expect(by('Yes').group?.mode).toBe('single')
    expect(by('I agree').group).toBeUndefined()
  })
})
