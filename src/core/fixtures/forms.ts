// Synthetic forms for tests and the learning benchmark: PDFs drawn with pdf-lib in layouts that real forms use, each
// with the fields an admin sets up on it (its truth). Words, sizes, borders and the order of sections change with
// the seed, and 'train' and 'test' forms never share a label, question or item: a 'test' form is one auto-detect
// has never seen. Test code only (pdf-lib is a dev dependency here).

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { FieldType } from '../form-logic'

/**
 * The layouts:
 * - grid:    a ruled grid of "Label:" cells, each followed by a blank cell to write in
 * - yesNo:   a checklist table with drawn Y / N / NA boxes (one answer per row) and a Comments cell
 * - printed: a checklist whose answer cell has the choices printed in it ("Yes/No/NA") instead of boxes
 * - lines:   "Label: ________" answer lines typed as text
 * - boxes:   a label over a light filled box without a border (web-style input boxes)
 * - bullets: instructions after hollow square bullets (small boxes that are not checkboxes)
 * - open:    a question answered in the blank space under it: nothing drawn, so auto-detect proposes nothing there
 *            and the admin draws the field (not in the default mix: STYLES)
 */
export type Style = 'grid' | 'yesNo' | 'printed' | 'lines' | 'boxes' | 'bullets' | 'open'
export const STYLES: Style[] = ['grid', 'yesNo', 'printed', 'lines', 'boxes', 'bullets']

/** A field the admin wants on the form. */
export interface TrueField {
  page: number
  /** Page fractions from the top left. */
  x: number
  y: number
  width: number
  height: number
  type: FieldType
  label: string
  options?: string[]
  /** Fields with the same group answer one question together (its Y / N / NA boxes). */
  group?: string
  /** One answer (default) or any of them. */
  groupMode?: 'single' | 'multiple'
  required?: boolean
}

export interface Form {
  name: string
  bytes: Uint8Array
  truth: TrueField[]
}

export interface FormOptions {
  seed: number
  /** The layouts, in order. Default: three, picked by the seed. */
  styles?: Style[]
  /** Which half of each word list it draws from: 'train' and 'test' forms never share a label or question. */
  words?: 'train' | 'test'
  /** Rows per section. Default 6. */
  rows?: number
  /** Table borders: 0.48 pt filled bars as Word draws them ('hair') or 1 pt lines. Default: picked by the seed. */
  borders?: 'hair' | 'line'
}

// [label, the type an admin gives it]: pairs that share a word ("expiry"), one for training forms, one for test.
const NAMED: [string, FieldType][] = [
  ['Certificate expiry', 'date'],
  ['Passport expiry', 'date'],
  ['Licence valid until', 'date'],
  ['Insurance valid until', 'date'],
  ['Number of crew', 'number'],
  ['Number of visitors', 'number'],
  ['Hours worked', 'number'],
  ['Hours of rest', 'number'],
  ['Signed by', 'signature'],
  ['Countersigned by', 'signature'],
  ['Site name', 'text'],
  ['Vessel name', 'text'],
  ['Inspector', 'text'],
  ['Supervisor', 'text'],
  ['Department', 'text'],
  ['Location', 'text'],
  ['Contractor', 'text'],
  ['Company', 'text'],
  ['Permit number', 'text'],
  ['Reference number', 'text'],
  ['Date of inspection', 'date'],
  ['Date of issue', 'date'],
  ['Email address', 'email'],
  ['Contact email', 'email'],
  ['Phone', 'phone'],
  ['Mobile number', 'phone'],
  ['Work order', 'text'],
  ['Asset tag', 'text'],
]
const QUESTIONS = [
  'Are fire extinguishers inspected and tagged?',
  'Is the emergency exit clear of obstructions?',
  'Are first aid kits fully stocked?',
  'Has the crew attended the safety briefing?',
  'Are lifting gears certified and marked?',
  'Is the permit to work displayed on site?',
  'Are gas detectors calibrated this month?',
  'Are walkways free of oil and debris?',
  'Is personal protective equipment worn?',
  'Are electrical panels closed and labelled?',
  'Has the drill been recorded in the log book?',
  'Are ladders secured before use?',
  'Is the spill kit available near the tank?',
  'Are the alarms tested every week?',
  'Is the waste segregated correctly?',
  'Are the hoses free of cracks and leaks?',
  'Have visitors signed the register?',
  'Is the lighting adequate in the stores?',
  'Are the chemicals stored in marked lockers?',
  'Is the noise level within the limits?',
  'Are guard rails fitted at open edges?',
  'Is the water supply tested for quality?',
  'Have the contractors received an induction?',
  'Is the vehicle log filled in daily?',
]
const ITEMS = [
  'Copy of identity proof',
  'Address proof verified',
  'Salary slips for three months',
  'Bank statement of six months',
  'Signed application form',
  'Photographs of the applicant',
  'Income tax returns for two years',
  'Property valuation report',
  'Title documents of the property',
  'No objection certificate',
  'Sanction letter issued',
  'Insurance policy assigned',
  'Building plan approval',
  'Share certificate of society',
  'Employer certificate',
  'Credit report reviewed',
  'Guarantor documents',
  'Processing fee received',
  'Site visit completed',
  'Legal opinion obtained',
]
const PROMPTS = [
  'Describe the work carried out',
  'Give details of the incident',
  'Explain the cause of the delay',
  'List the defects found',
  'Summary of the findings',
  'Actions taken on board',
  'Reason for the change',
  'Comments of the master',
  'Recommendations of the inspector',
  'Observations during the visit',
  'Remarks of the surveyor',
  'Corrective action proposed',
]
const CHOICES = ['Yes/No/NA', 'Yes/No', 'Y/N', 'Yes / No / N.A.']
const INSTRUCTIONS = [
  'Read every question carefully and answer it in the space provided before you sign the form.',
  'Attach copies of the documents listed below and keep the originals ready for verification.',
  'Use block letters in black or blue ink and do not overwrite any of the entries already made.',
  'Any correction must be initialled by the person who makes it, with the date of the change.',
  'Incomplete forms are returned to the applicant without being processed by the office.',
  'The inspector keeps one copy of this report and sends the other one to the head office.',
  'Questions that do not apply to this site are marked as not applicable with a short reason.',
  'Photographs must show the condition of the equipment at the time of the inspection.',
  'All findings are discussed with the person in charge before the inspector leaves the site.',
  'Overdue actions from the last report are listed again with their new target dates.',
]
const TITLES = ['Section A', 'Part 1', 'Details', 'General information', 'Checklist', 'Documents', 'Inspection']

/** A seeded random number generator (mulberry32): the same seed, the same form. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A synthetic form and its truth. */
export async function makeForm({ seed, styles, words = 'train', rows = 6, borders }: FormOptions): Promise<Form> {
  const rnd = random(seed)
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)]
  const half = <T,>(list: T[]) => list.filter((_, i) => i % 2 === (words === 'train' ? 0 : 1))
  const shuffled = <T,>(list: T[]) => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  const named = shuffled(half(NAMED))
  const questions = shuffled(half(QUESTIONS))
  // Not shuffled: the forms of the other layouts stay as they were (the seed's random numbers are not used up).
  const prompts = half(PROMPTS).map((_, i, all) => all[(i + seed) % all.length])
  const items = shuffled(half(ITEMS))
  const notes = shuffled(INSTRUCTIONS)
  const take = <T,>(list: T[], i: number) => list[i % list.length]

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [W, H] = rnd() < 0.5 ? [595, 842] : [612, 792]
  const size = pick([8, 9, 10, 11])
  const rowH = size * (1.6 + rnd() * 0.6)
  const margin = 36 + Math.round(rnd() * 24)
  const hair = rnd() < 0.5 ? borders !== 'line' : borders === 'hair' // 0.48 pt filled bars (Word) or 1 pt lines
  const truth: TrueField[] = []
  let page: PDFPage = doc.addPage([W, H])
  let pageNo = 1
  let y = margin // top of what comes next, from the page's top
  const room = (h: number) => {
    if (y + h <= H - margin) return
    page = doc.addPage([W, H])
    pageNo++
    y = margin
  }
  const text = (s: string, x: number, top: number, f: PDFFont = font, sz = size) =>
    page.drawText(s, { x, y: H - top - sz * 0.8, size: sz, font: f, color: rgb(0, 0, 0) })
  const hline = (x0: number, x1: number, at: number) =>
    hair
      ? page.drawRectangle({ x: x0, y: H - at - 0.24, width: x1 - x0, height: 0.48, color: rgb(0, 0, 0) })
      : page.drawLine({ start: { x: x0, y: H - at }, end: { x: x1, y: H - at }, thickness: 1 })
  const vline = (x: number, y0: number, y1: number) =>
    hair
      ? page.drawRectangle({ x: x - 0.24, y: H - y1, width: 0.48, height: y1 - y0, color: rgb(0, 0, 0) })
      : page.drawLine({ start: { x, y: H - y0 }, end: { x, y: H - y1 }, thickness: 1 })
  // A ruled row: walls at `xs`, top `top`, `h` high.
  const ruled = (xs: number[], top: number, h: number) => {
    hline(xs[0], xs[xs.length - 1], top)
    hline(xs[0], xs[xs.length - 1], top + h)
    for (const x of xs) vline(x, top, top + h)
  }
  const field = (f: Omit<TrueField, 'page' | 'x' | 'y' | 'width' | 'height'>, x: number, top: number, w: number, h: number) =>
    truth.push({ ...f, page: pageNo, x: x / W, y: top / H, width: w / W, height: h / H })
  const title = (s: string) => {
    room(rowH * 3)
    y += rowH * 0.5
    text(s, margin, y, bold, size + 2)
    y += rowH * 1.4
  }
  const wrap = (s: string, width: number) => {
    const lines: string[] = []
    let line = ''
    for (const word of s.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
    return lines
  }

  const sections: Record<Style, (n: number) => void> = {
    grid(n) {
      title(pick(TITLES))
      const span = W - 2 * margin
      const xs = [margin, margin + span * 0.22, margin + span * 0.5, margin + span * 0.72, W - margin]
      for (let r = 0; r < n; r++) {
        room(rowH)
        ruled(xs, y, rowH)
        for (const c of [0, 1]) {
          const [label, type] = take(named, r * 2 + c)
          text(`${label}:`, xs[c * 2] + 3, y + (rowH - size) / 2)
          field({ type, label }, xs[c * 2 + 1] + 1.5, y + 1.5, xs[c * 2 + 2] - xs[c * 2 + 1] - 3, rowH - 3)
        }
        y += rowH
      }
    },
    yesNo(n) {
      title(pick(TITLES))
      const span = W - 2 * margin
      const box = size * 0.9
      const head = pick([['Y', 'N', 'NA'], ['Yes', 'No', 'N/A']])
      const xs = [margin, margin + 24, margin + span * 0.58, margin + span * 0.65, margin + span * 0.72, margin + span * 0.79, W - margin]
      room(rowH * 2)
      ruled(xs, y, rowH)
      for (const [i, s] of ['No.', 'Question', ...head, 'Comments'].entries()) text(s, xs[i] + 3, y + (rowH - size) / 2, bold)
      y += rowH
      for (let r = 0; r < n; r++) {
        const q = take(questions, r)
        const lines = wrap(q, xs[2] - xs[1] - 6)
        const h = Math.max(rowH, lines.length * size * 1.25 + 6)
        room(h)
        ruled(xs, y, h)
        text(`${r + 1}`, xs[0] + 3, y + 3)
        lines.forEach((l, i) => text(l, xs[1] + 3, y + 3 + i * size * 1.25))
        for (let c = 0; c < 3; c++) {
          const bx = (xs[2 + c] + xs[3 + c]) / 2 - box / 2
          const by = y + h / 2 - box / 2
          page.drawRectangle({ x: bx, y: H - by - box, width: box, height: box, borderWidth: 0.8, borderColor: rgb(0, 0, 0) })
          field({ type: 'checkbox', label: `${q} – ${head[c]}`, group: `p${pageNo}r${r}y${Math.round(y)}` }, bx - 1, by - 1, box + 2, box + 2)
        }
        field({ type: 'text', label: `${q} – Comments` }, xs[5] + 1.5, y + 1.5, xs[6] - xs[5] - 3, h - 3)
        y += h
      }
    },
    printed(n) {
      title(pick(TITLES))
      const span = W - 2 * margin
      const choice = pick(CHOICES)
      const options = choice.split('/').map((s) => s.trim())
      const xs = [margin, margin + 24, margin + span * 0.74, W - margin]
      room(rowH * 2)
      ruled(xs, y, rowH)
      for (const [i, s] of ['No.', pick(['Documents', 'Item', 'Particulars']), pick(['Status', 'Remarks', 'Answer'])].entries())
        text(s, xs[i] + 3, y + (rowH - size) / 2, bold)
      y += rowH
      for (let r = 0; r < n; r++) {
        room(rowH)
        ruled(xs, y, rowH)
        const item = take(items, r)
        text(`${r + 1}`, xs[0] + 3, y + (rowH - size) / 2)
        text(item, xs[1] + 3, y + (rowH - size) / 2)
        text(choice, (xs[2] + xs[3]) / 2 - font.widthOfTextAtSize(choice, size) / 2, y + (rowH - size) / 2)
        field({ type: 'dropdown', label: item, options }, xs[2] + 1.5, y + 1.5, xs[3] - xs[2] - 3, rowH - 3)
        y += rowH
      }
    },
    lines(n) {
      title(pick(TITLES))
      for (let r = 0; r < n; r++) {
        room(rowH * 1.6)
        const [label, type] = take(named, r + 7)
        const lead = `${label}: `
        const lw = font.widthOfTextAtSize(lead, size)
        const under = '_'.repeat(Math.max(8, Math.floor((W - 2 * margin - lw) * 0.6 / font.widthOfTextAtSize('_', size))))
        text(lead + under, margin, y + rowH * 0.6)
        const uw = font.widthOfTextAtSize(under, size)
        field({ type, label }, margin + lw, y + rowH * 0.6 + size - rowH, uw, rowH)
        y += rowH * 1.6
      }
    },
    boxes(n) {
      title(pick(TITLES))
      const span = W - 2 * margin
      const bw = span * 0.46
      const tone = pick([rgb(0.93, 0.95, 0.99), rgb(0.95, 0.95, 0.95), rgb(0.94, 0.97, 0.94)])
      for (let r = 0; r < n; r += 2) {
        room(rowH * 3)
        for (const c of [0, 1]) {
          if (r + c >= n) break
          const [label, type] = take(named, r + c + 3)
          const x = margin + c * (span - bw)
          text(label, x, y)
          const top = y + size * 1.5
          page.drawRectangle({ x, y: H - top - rowH, width: bw, height: rowH, color: tone })
          field({ type, label }, x, top, bw, rowH)
        }
        y += size * 1.5 + rowH * 1.6
      }
    },
    bullets(n) {
      title(pick(['Instructions', 'Notes', 'Before you start']))
      const box = size * 0.7
      for (let r = 0; r < Math.min(n, 5); r++) {
        const lines = wrap(take(notes, r), W - 2 * margin - 20)
        room(lines.length * size * 1.3 + 4)
        page.drawRectangle({ x: margin, y: H - y - size * 0.15 - box, width: box, height: box, borderWidth: 0.7, borderColor: rgb(0, 0, 0) })
        lines.forEach((l, i) => text(l, margin + 16, y + i * size * 1.3))
        y += lines.length * size * 1.3 + 4
      }
    },
    open(n) {
      title(pick(['Description', 'Details of work', 'Report']))
      for (let r = 0; r < Math.min(n, 4); r++) {
        const prompt = take(prompts, r)
        const h = rowH * (2 + Math.floor(rnd() * 2))
        room(size * 1.6 + h + rowH)
        text(`${prompt}:`, margin, y)
        const top = y + size * 1.6
        field({ type: 'textarea', label: prompt }, margin, top, W - 2 * margin, h)
        y = top + h + rowH * 0.6
      }
    },
  }
  const order = styles ?? shuffled(STYLES).slice(0, 3)
  for (const [i, s] of order.entries()) sections[s](rows + (i % 2))
  return { name: `form ${seed} (${order.join(', ')})`, bytes: await doc.save(), truth }
}
