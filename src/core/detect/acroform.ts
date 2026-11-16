// A PDF's own fillable fields (an AcroForm made in Acrobat, Word…) as suggestions: where they are and what they are
// is written in the PDF, nothing to guess.

import type { FieldDef, FieldType, Position } from '../form-logic'
import { fitInPage, overlap } from '../coords'
import type { TextLine } from '../layout'
import { cleanLabel, typeFor } from './labels'
import type { PdfPage } from './page'

/** A fillable field of the PDF itself (a pdf.js widget annotation), as far as formlift uses it. */
interface Widget {
  subtype?: string
  fieldType?: 'Tx' | 'Btn' | 'Ch' | 'Sig'
  fieldName?: string
  alternativeText?: string
  rect: number[]
  hidden?: boolean
  noView?: boolean
  readOnly?: boolean
  required?: boolean
  multiLine?: boolean
  maxLen?: number
  fieldValue?: unknown
  checkBox?: boolean
  radioButton?: boolean
  multiSelect?: boolean
  options?: { displayValue?: string; exportValue?: string }[]
}

/**
 * The PDF's own fillable fields on a page (made in Acrobat, Word…), as suggestions: where they are and what they
 * are is written in the PDF, nothing to guess. Labels come from the text beside them (left, or above; a checkbox's
 * on its right), else from the field's tooltip or name. Radio buttons become a 'single' group of checkboxes.
 */
export async function ownFields(page: PdfPage, lines: TextLine[], page_: number): Promise<Omit<FieldDef, 'id' | 'key'>[]> {
  const all = ((await page.getAnnotations?.()) ?? []) as Widget[]
  const [vx0, vy0, vx1, vy1] = page.view
  const [W, H] = [vx1 - vx0, vy1 - vy0]
  const out: Omit<FieldDef, 'id' | 'key'>[] = []
  for (const w of all) {
    if (w.subtype !== 'Widget' || !w.fieldType || w.hidden || w.noView) continue
    if (w.fieldType === 'Btn' && !w.checkBox && !w.radioButton) continue // a push button
    const [x0, x1] = [Math.min(w.rect[0], w.rect[2]), Math.max(w.rect[0], w.rect[2])]
    const [y0, y1] = [Math.min(w.rect[1], w.rect[3]), Math.max(w.rect[1], w.rect[3])]
    const position = fitInPage({ page: page_, x: (x0 - vx0) / W, y: (vy1 - y1) / H, width: (x1 - x0) / W, height: (y1 - y0) / H })
    const box = w.fieldType === 'Btn'
    const label = cleanLabel(besideText(position, lines, box)) || cleanLabel(w.alternativeText ?? '') || nameOf(w.fieldName)
    const options = (w.options ?? []).map((o) => o.displayValue ?? o.exportValue ?? '').filter(Boolean)
    const type: FieldType =
      w.fieldType === 'Sig' ? 'signature'
      : box ? 'checkbox'
      : w.fieldType === 'Ch' ? (w.multiSelect ? 'multiselect' : 'dropdown')
      : w.multiLine ? 'textarea'
      : typeFor(label)
    const value = typeof w.fieldValue === 'string' && w.fieldType === 'Tx' ? w.fieldValue : ''
    out.push({
      type,
      label,
      source: 'ai',
      confidence: 1,
      position,
      ...(options.length && w.fieldType === 'Ch' ? { options } : {}),
      ...(w.maxLen && type !== 'signature' ? { maxLength: w.maxLen } : {}),
      ...(value ? { defaultValue: value } : {}),
      ...(w.required ? { required: true } : {}),
      ...(w.readOnly ? { readOnly: true } : {}),
      ...(w.radioButton ? { group: { id: `pdf:${w.fieldName ?? ''}`, mode: 'single' as const } } : {}),
    })
  }
  return out
}

/** The text that names a box: on its left in the same row, else just above it; a checkbox's on its right first. */
function besideText(p: Position, lines: TextLine[], box: boolean) {
  const row = lines.filter((l) => overlap(l.y, l.y + l.height, p.y, p.y + p.height) > 0.5 * Math.min(l.height, p.height))
  const right = row.filter((l) => l.x >= p.x + p.width - 0.002 && l.x - (p.x + p.width) < 0.05).sort((a, b) => a.x - b.x)[0]
  const left = row
    .filter((l) => l.x + l.width <= p.x + 0.002 && p.x - (l.x + l.width) < 0.3)
    .sort((a, b) => b.x + b.width - (a.x + a.width))[0]
  const above = lines
    .filter((l) => l.y + l.height <= p.y + 0.002 && p.y - (l.y + l.height) < 0.03 && overlap(l.x, l.x + l.width, p.x, p.x + p.width) > 0)
    .sort((a, b) => b.y - a.y)[0]
  return ((box ? (right ?? left) : (left ?? above)) ?? above)?.text ?? ''
}

/** "topmostSubform[0].Page1[0].full_name[0]" → "full name". */
const nameOf = (name = '') => cleanLabel(name.split('.').pop()!.replace(/\[\d+\]/g, '').replace(/[_-]+/g, ' '))
