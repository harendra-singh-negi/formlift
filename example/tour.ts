// The demo's tours: Basic = every field type, Advanced = every form-logic feature. Each feature has its own row
// of a PDF that says what it is for and how to try it. The PDF is drawn here with pdf-lib and the fields come from the same
// rows, so each field sits right next to its explanation.
import type { FieldChangeApi } from 'formlift/react'
import type { AnswerValue, Condition, FieldDef, FieldType } from 'formlift'
import type { FormDoc } from 'formlift/react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const [W, H] = [595, 842]
const BOX_X = 330 // fields start here (points)
const BOX_W = 215

type Extra = Partial<FieldDef>
interface Row {
  title: string
  help: string
  /** One field, or several side by side (a group of boxes). */
  fields: { type: FieldType; key: string; label: string; w?: number; caption?: string; extra?: Extra }[]
  h?: number
}
interface Page {
  heading: string
  intro: string
  /** Height of a row: room for its title and help text. */
  rowH: number
  rows: Row[]
}

const eq = (fieldKey: string, value: string): Condition => ({ logic: 'and', rules: [{ fieldKey, op: 'equals', value }] })
const one = (type: FieldType, key: string, label: string, extra?: Extra, h?: number): Pick<Row, 'fields' | 'h'> => ({
  fields: [{ type, key, label, extra }],
  h,
})

const PAGES: Page[] = [
  {
    heading: 'Basic · Every field type',
    intro: 'Answer each field on the right. Hover a field for its help; Submit checks every rule shown here.',
    rowH: 26,
    rows: [
      { title: 'Text', help: 'Short answers. Required here, with a placeholder.', ...one('text', 'name', 'Name', { required: true, placeholder: 'Your name' }) },
      { title: 'Text area', help: 'Several lines; at most 200 characters here.', ...one('textarea', 'notes', 'Notes', { maxLength: 200 }, 40) },
      { title: 'Number', help: 'Digits only, between 0 and 120.', ...one('number', 'age', 'Age', { min: 0, max: 120 }) },
      { title: 'Date', help: 'The browser\'s own date picker.', ...one('date', 'visit', 'Visit date') },
      { title: 'Time', help: 'HH:MM, with the browser\'s time picker.', ...one('time', 'start', 'Start time') },
      { title: 'Date & time', help: 'Both in one field.', ...one('datetime', 'arrival', 'Arrival') },
      { title: 'Email', help: 'Checked for name@domain.', ...one('email', 'email', 'Email') },
      { title: 'Phone', help: 'Digits, spaces, + ( ) -.', ...one('phone', 'phone', 'Phone') },
      { title: 'Web address (URL)', help: 'http(s) links only.', ...one('url', 'website', 'Website') },
      { title: 'Currency', help: 'A symbol and 2 decimals; letters are dropped as you type.', ...one('currency', 'fee', 'Fee', { currency: '$', decimals: 2 }) },
      { title: 'Dropdown', help: 'Pick one option.', ...one('dropdown', 'flag', 'Flag', { options: ['Panama', 'Liberia', 'Marshall Islands'] }) },
      { title: 'Radio group', help: 'One of a few options, all visible.', ...one('radio', 'shift', 'Shift', { options: ['Day', 'Night'] }) },
      { title: 'Multi-select', help: 'Several options, chosen in a dialog.', ...one('multiselect', 'cargo', 'Cargo', { options: ['Oil', 'Gas', 'Chemicals', 'Containers'] }) },
      { title: 'Checklist', help: 'Several boxes; tick 1 or 2 here (min / max).', ...one('checklist', 'checks', 'Checks done', { options: ['Hull', 'Engine', 'Bridge'], min: 1, max: 2 }, 30) },
      { title: 'Checkbox', help: 'One yes / no box.', ...one('checkbox', 'agree', 'I agree', {}, 16) },
      { title: 'Yes / No toggle', help: 'A switch: a boolean answer like a checkbox.', ...one('toggle', 'pilot', 'Pilot on board') },
      { title: 'Rating', help: 'Stars; tap the chosen star again to clear.', ...one('rating', 'score', 'Score', { max: 5 }) },
      { title: 'Slider', help: 'A value from 0 to 100 in steps of 5.', ...one('slider', 'fuel', 'Fuel %', { min: 0, max: 100, step: 5 }) },
      { title: 'File upload', help: 'Your app stores the file (onUpload).', ...one('file', 'photo', 'Photo') },
      { title: 'Signature', help: 'Draw with mouse or finger.', ...one('signature', 'sign', 'Signature', {}, 36) },
    ],
  },
  {
    heading: 'Advanced · Form logic',
    intro: 'Set up in the editor (select a field, see its panel) or in the form JSON. Checked in the browser and on your server.',
    rowH: 40,
    rows: [
      {
        title: 'Group: exactly one',
        help: 'Separate boxes as on paper. Ticking one unticks the others; an answer is required.',
        fields: (['Yes', 'No', 'N/A'] as const).map((c, i) => ({
          type: 'checkbox' as const,
          key: `valid_${i}`,
          label: `Valid ${c}`,
          caption: c,
          w: 16,
          extra: { group: { id: 'valid', mode: 'single' as const, required: true } },
        })),
        h: 16,
      },
      {
        title: 'Group: several',
        help: 'Any number of boxes, here at least 1 and at most 2.',
        fields: ['Load', 'Discharge', 'Bunker'].map((c, i) => ({
          type: 'checkbox' as const,
          key: `ops_${i}`,
          label: `Operation ${c}`,
          caption: c,
          w: 16,
          extra: { group: { id: 'ops', mode: 'multiple' as const, min: 1, max: 2, required: true } },
        })),
        h: 16,
      },
      { title: 'Show when…', help: 'Pick "Employed": a Company field appears below.', ...one('dropdown', 'status', 'Status', { options: ['Employed', 'Other'] }) },
      { title: '   Company', help: 'visibleWhen: Status equals Employed (and required then).', ...one('text', 'company', 'Company', { required: true, visibleWhen: eq('status', 'Employed') }) },
      { title: 'Required when…', help: 'Turn the toggle on: the reason below becomes required.', ...one('toggle', 'delayed', 'Delayed') },
      { title: '   Delay reason', help: 'requiredWhen: Delayed is on.', ...one('text', 'delay_reason', 'Delay reason', { requiredWhen: eq('delayed', 'true') }) },
      {
        title: 'Follow-up dialog',
        help: 'Answer "No": a dialog asks why and by when. The badge next to the field reopens it.',
        ...one('radio', 'certs', 'Certificates valid?', {
          options: ['Yes', 'No'],
          followUp: { when: eq('certs', 'No'), title: 'Certificates: what is missing?', fields: ['certs_why', 'certs_due'] },
        }),
      },
      {
        title: 'Comments',
        help: 'The speech bubble next to the field opens its comments: add one, see author and time.',
        ...one('text', 'remarks', 'Remarks', { comments: true }),
      },
      {
        title: 'Your logic: onFieldChange',
        help: 'Over 10,000: the demo\'s onFieldChange shows a message (api.notify).',
        ...one('currency', 'claim', 'Claim amount', { currency: '$' }),
      },
      {
        title: 'Your logic: your dialog',
        help: 'Switch on: onFieldChange opens a dialog with two questions (api.openDialog).',
        ...one('toggle', 'incident', 'Incident'),
      },
      {
        title: 'Read-only when…',
        help: 'Once "Signed off" is ticked, the inspector name is locked.',
        ...one('checkbox', 'signed_off', 'Signed off', {}, 16),
      },
      { title: '   Inspector', help: 'readOnlyWhen: Signed off is ticked.', ...one('text', 'inspector', 'Inspector', { readOnlyWhen: eq('signed_off', 'true') }) },
    ],
  },
]

// Dialog-only fields: asked by the follow-up and by the demo's onFieldChange, never on the page.
const DIALOG: { key: string; type: FieldType; label: string; extra?: Extra }[] = [
  { key: 'certs_why', type: 'textarea', label: 'What is missing?', extra: { required: true } },
  { key: 'certs_due', type: 'date', label: 'Due by' },
  // asked by onFieldChange, not a follow-up: visibleWhen says when they count (else "required" would always apply)
  { key: 'incident_time', type: 'datetime', label: 'When did it happen?', extra: { required: true, visibleWhen: eq('incident', 'true') } },
  { key: 'incident_place', type: 'text', label: 'Where?', extra: { visibleWhen: eq('incident', 'true') } },
]

const ROW_GAP = 6
const TOP = 110

export type TourKind = 'types' | 'logic'

/** A tour's PDF and its form, drawn from the same rows: 'types' (Basic) or 'logic' (Advanced). */
export async function makeTour(kind: TourKind): Promise<{ pdf: Blob; form: FormDoc }> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fields: FieldDef[] = []
  const add = (f: Omit<FieldDef, 'id' | 'source'>) => fields.push({ id: `tour-${f.key}`, source: 'manual', ...f } as FieldDef)

  ;[PAGES[kind === 'types' ? 0 : 1]].forEach((p, i) => {
    const page = doc.addPage([W, H])
    const ink = rgb(0.12, 0.16, 0.22)
    const grey = rgb(0.42, 0.45, 0.5)
    page.drawText(p.heading, { x: 50, y: H - 60, size: 20, font: bold, color: ink })
    page.drawText(p.intro, { x: 50, y: H - 82, size: 9, font, color: grey, maxWidth: W - 100, lineHeight: 11 })
    let y = TOP
    for (const row of p.rows) {
      const h = row.h ?? 22
      const rowH = Math.max(h, p.rowH)
      page.drawText(row.title, { x: 50, y: H - y - 11, size: 10.5, font: bold, color: ink })
      page.drawText(row.help, { x: 50, y: H - y - 24, size: 7.5, font, color: grey, maxWidth: BOX_X - 65, lineHeight: 9 })
      let x = BOX_X
      for (const f of row.fields) {
        const w = f.w ?? BOX_W
        if (f.caption) page.drawText(f.caption, { x: x + w + 4, y: H - y - 12, size: 9, font, color: ink })
        add({
          key: f.key,
          type: f.type,
          label: f.label,
          position: { page: i + 1, x: x / W, y: y / H, width: w / W, height: h / H },
          ...f.extra,
        })
        x += w + (f.caption ? 60 : 8)
      }
      page.drawLine({ start: { x: 50, y: H - y - rowH - ROW_GAP / 2 }, end: { x: W - 50, y: H - y - rowH - ROW_GAP / 2 }, thickness: 0.3, color: rgb(0.85, 0.87, 0.9) })
      y += rowH + ROW_GAP
    }
    if (y > H - 30) throw new Error(`tour page ${i + 1} is too long: ${y} pt`)
  })
  for (const d of DIALOG)
    if (kind === 'logic')
      add({ key: d.key, type: d.type, label: d.label, dialogOnly: true, position: { page: 1, x: 0.1, y: 0.9, width: 0.3, height: 0.03 }, ...d.extra })

  const bytes = await doc.save()
  return { pdf: new Blob([bytes as BlobPart], { type: 'application/pdf' }), form: { fields, layout: null } }
}

/** The demo's own logic (FormFiller onFieldChange): what an app writes for rules the editor can't express. */
export function tourOnFieldChange(field: FieldDef, value: AnswerValue, api: FieldChangeApi) {
  if (field.key === 'claim' && Number(value) > 10000) api.notify('Claims over $10,000 need a manager\'s approval.')
  if (field.key === 'incident' && value === true) api.openDialog(['incident_time', 'incident_place'], 'Incident details')
}
