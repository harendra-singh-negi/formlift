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
      'text: Vessel name',
      'textarea: Remarks',
    ])
  })

  it('drawing through a scaled transform', async () => {
    expect(await detect('scaled.pdf')).toEqual(['checkbox: Checked', 'text: Inspector'])
  })
})
