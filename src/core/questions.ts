// The form as a list of questions (the List view): fields on one line of the document that belong together —
// "2.1.1 Were the Master… – Y / N / NA" and the Remarks box beside them — become one question, so it can be
// searched and filtered as a whole. Grids of boxes and tables are one question each, laid out in the document's
// rows and columns. Titles are the document's own text when the page text is given.
import type { AnswerValue, Answers, FieldDef, FieldType } from './form-logic'
import type { TextLine } from './layout'

export interface Question {
  id: string
  title: string
  page: number
  parts: { field: FieldDef; name: string }[]
  /** Option grid or table: parts per line of the document, to lay them out in the same rows. */
  rows?: number[]
  /** Table: its column names (parts are row by row, left to right), and each row's own name when rows have one. */
  columns?: string[]
  rowNames?: string[]
  /** The category heading the question sits under (e.g. "HW", "PR", "HF" in inspection checklists), when the form has them. */
  category?: string
  /** The numbered question heading it answers ("2.1.1 Maintenance of statutory Certificates"), when written above. */
  section?: string
  /** A column of boxes named by the text block left of it (its options come first). */
  block?: boolean
  /** "Classification: Core , Risk: H , Assigned to: MASTER" written in its numbered question: filters. */
  tags?: Record<string, string>
  /** What a run of rows with the same choices asks ("Evaluation of the level of compliance…"), shown over them. */
  intro?: string
}

/** Text lines of a form page (page fractions, top-left origin, as field positions), when known. */
export type PageText = (page: number) => TextLine[] | undefined

// "Row – Column" labels (auto-detect, or typed that way): the row is the question, the column names the part.
const SEP = ' – '
const rowOf = (label: string) => (label.includes(SEP) ? label.slice(0, label.lastIndexOf(SEP)) : null)
const colOf = (label: string) => (label.includes(SEP) ? label.slice(label.lastIndexOf(SEP) + SEP.length) : label)
// A field named only like a column (Y, No, Remarks…) belongs to the question on its line.
// A row number: "1", "2.", "3)", "a)", "iv."
const SERIAL = /^(\d{1,3}|[a-z]|[ivx]{1,5})[.)]?$/i
const COLUMN = /^(y|n|n ?a|yes|no|remarks?|comments?|observations?|notes?)$/i

// "LAST PSC INSPECTION: Place": a question and the name of its first part.
const LEAD = /^(.+?):\s+(\S.*)$/

const byX = (a: FieldDef, b: FieldDef) => a.position.x - b.position.x
const norm = (s: string) =>
  s
    .replace(/[:.\s…]+$/, '')
    .trim()
    .toLowerCase()
const top = (fs: FieldDef[]) => Math.min(...fs.map((f) => f.position.y))
const bottom = (fs: FieldDef[]) => Math.max(...fs.map((f) => f.position.y + f.position.height))
const left = (fs: FieldDef[]) => Math.min(...fs.map((f) => f.position.x))
const right = (fs: FieldDef[]) => Math.max(...fs.map((f) => f.position.x + f.position.width))

// The question written on the fields' line, left of them: the nearest column of text (not the item number or
// category columns further left), in reading order.
function rowText(lines: TextLine[], fs: FieldDef[]) {
  const y0 = top(fs)
  const y1 = bottom(fs)
  const x = left(fs)
  // The fields' own names written beside them ("Yes ☐  No ☐") are not the question.
  const own = new Set(fs.map((f) => norm(f.label)))
  const beside = lines.filter(
    (l) =>
      l.y + l.height / 2 > y0 - 0.002 &&
      l.y + l.height / 2 < y1 + 0.002 &&
      l.x + l.width <= x + 0.005 &&
      !own.has(norm(l.text)),
  )
  if (!beside.length) return ''
  const nearest = beside.reduce((a, b) => (b.x + b.width > a.x + a.width ? b : a))
  return beside
    .filter((l) => l.x >= nearest.x - 0.02)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l) => l.text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
}

// A table's title: the nearest line above its first row that is at least half as wide as the row (a title or
// heading bar, not a single column header).
function tableTitle(lines: TextLine[], first: FieldDef[]) {
  const y0 = top(first)
  const span = right(first) - left(first)
  const above = lines.filter((l) => l.y + l.height <= y0 + 0.002).sort((a, b) => b.y - a.y)
  let at: TextLine | undefined = above.find((l) => y0 - l.y < 0.15 && l.width >= 0.5 * span)
  // Up through the lines right above it (a note under the title runs on for lines): the block's first line.
  for (let cur = at; cur; cur = at) {
    const c: TextLine = cur
    at = above.find((l) => l.y < c.y - 0.001 && c.y - (l.y + l.height) < 0.6 * c.height) ?? c
    if (at === c) break
  }
  return at?.text.trim() ?? ''
}

// A grid of options ("Loading ☐  Discharging ☐ …"): lines of bare checkboxes named only by their own text. Its
// heading is the line right above the grid with no field on it ("OPERATIONS AT THE TIME OF INSPECTION:"), else
// the text left of the boxes on their line ("If the ship was detained… ☐ Verified ☐ N/A").
// A " – " inside a name ("Log-24a (Job Orders – Engine)") is part of the name when no two boxes share the part
// before it: a real "Row – Column" line repeats its row ("2.1.1 … – Y", "2.1.1 … – N").
const isOptions = (line: FieldDef[]) => {
  const rows = line.map((f) => rowOf(f.label)).filter(Boolean)
  const shared = rows.length > 0 && (line.length < 2 || new Set(rows).size < rows.length)
  return (
    !shared &&
    line.every(
      (f) =>
        (f.type === 'checkbox' || f.type === 'radio') &&
        !COLUMN.test(f.label.trim()) &&
        !COLUMN.test(colOf(f.label).trim()),
    )
  )
}

function heading(lines: TextLine[], line: FieldDef[], fields: FieldDef[]) {
  const y0 = top(line)
  const h = bottom(line) - y0
  const names = new Set(fields.map((f) => norm(f.label)))
  const free = (l: TextLine) => {
    const mid = l.y + l.height / 2
    return !names.has(norm(l.text)) && !fields.some((f) => mid > f.position.y && mid < f.position.y + f.position.height)
  }
  // The grid's width: its boxes and their names written beside them. A heading sits over it, not off to a side
  // ("Practical Guidelines" centred over a column of text is not the heading of boxes at the left edge).
  const own = new Set(line.map((f) => norm(f.label)))
  const named = lines.filter((l) => own.has(norm(l.text)) && l.y + l.height > y0 && l.y < y0 + h)
  const x0 = Math.min(left(line), ...named.map((l) => l.x))
  const x1 = Math.max(right(line), ...named.map((l) => l.x + l.width))
  // Text running on to the right of the boxes on their line ("☐ Human  The Inspector is expected to…"): the boxes
  // are a side column of a text block, not a grid of options.
  if (
    lines.some(
      (l) => !own.has(norm(l.text)) && l.x >= x1 - 0.002 && l.y + l.height / 2 > y0 && l.y + l.height / 2 < y0 + h,
    )
  )
    return null
  const upFrom = (y: number, gap: (l: TextLine) => number) =>
    lines
      .filter((l) => l.y + l.height <= y + 0.002 && y - (l.y + l.height) < gap(l) && l.x < x1 && l.x + l.width > x0)
      .sort((a, b) => b.y - a.y)[0]
  const above = upFrom(y0, (l) => 1.5 * Math.max(h, l.height))
  if (!above || !free(above)) return rowText(lines, line)
  // A heading of a few lines ("Qualifications" over "(tick all boxes that apply)"): the lines set tight above.
  const block = [above]
  for (let l = above; block.length < 3; ) {
    const up = upFrom(l.y, (u) => 0.6 * u.height)
    if (!up || !free(up)) break
    block.unshift((l = up))
  }
  return block.map((l) => l.text.trim()).join(' ')
}

// A table's header row: the line of text right above its first row, one name over each column ("Training
// Topic", "Name/Rank", "Date"). Only when every column has its own name there; a single column's name is centred
// over it (the last line of a paragraph above starts at the margin instead).
function headerRow(lines: TextLine[], first: FieldDef[]) {
  const y0 = top(first)
  const h = bottom(first) - y0
  const above = lines.filter((l) => l.y + l.height <= y0 + 0.002 && y0 - (l.y + l.height) < 1.5 * Math.max(h, l.height))
  const at = Math.max(...above.map((l) => l.y))
  const row = above.filter((l) => Math.abs(l.y - at) < 0.5 * l.height)
  const names = first.map((f) => {
    const over = row.filter((l) => {
      const mid = l.x + l.width / 2
      return mid > f.position.x && mid < f.position.x + f.position.width
    })
    const one = over.length === 1 ? over[0] : null
    const centred =
      one && Math.abs(one.x + one.width / 2 - (f.position.x + f.position.width / 2)) < 0.1 * f.position.width
    return one && (first.length > 1 || centred) ? one.text.trim() : ''
  })
  return names.every(Boolean) ? names : null
}

/** Questions in document order: page, then top to bottom. */
export interface ToQuestionsOptions {
  /**
   * Category headings: a line that is only a code like this ("HW", "PR", "HF") marks the questions under it, when
   * two codes or more come back. Default /^[A-Z]{2,4}$/. false = no categories (set Question.category yourself).
   */
  categoryCode?: RegExp | false
}

export function toQuestions(
  fields: FieldDef[],
  textOf: PageText = () => undefined,
  { categoryCode = CODE }: ToQuestionsOptions = {},
): Question[] {
  const sorted = [...fields].sort(
    (a, b) => a.position.page - b.position.page || a.position.y - b.position.y || a.position.x - b.position.x,
  )
  // Columns of boxes beside a block of text ("A. Vessel is free of: A1… A4…" │ ☐ Yes ☐ No ☐ NA): one question each.
  const stacks = findStacks(sorted, textOf)
  const stacked = new Set(stacks.flatMap((s) => s.fields))
  // Lines: fields that overlap the first field of the line vertically by half the smaller height.
  const lines: FieldDef[][] = []
  for (const f of sorted.filter((x) => !stacked.has(x))) {
    const line = lines[lines.length - 1]
    const head = line?.[0]
    const p = f.position
    const q = head?.position
    const shared = q ? Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y) : 0
    if (q && q.page === p.page && shared >= 0.5 * Math.min(p.height, q.height)) line.push(f)
    else lines.push([f])
  }
  // Tables: lines of fields named by their columns ("RANK", "NAME", "SIGNATURE", "DATE"), repeated on the line
  // above or below with the same columns. A row may carry the table's side heading on one field ("INSPECTOR
  // – RANK"); lines whose fields all share a row name ("2.1.1 … – Y / N") are questions, not table rows.
  // Numbered rows ("1 – Type of Training Need", or a box named just "1."): the number is the row's name, so
  // lines of them are a table (one column when each line has one field), not questions named "1", "2"…
  const serial = (f: FieldDef) => {
    const r = (rowOf(f.label) ?? f.label).trim()
    return SERIAL.test(r) && !COLUMN.test(r) ? r : ''
  }
  const column = (f: FieldDef) => (rowOf(f.label) ? colOf(f.label).trim() : serial(f) ? '' : f.label.trim())
  const sig = (line: FieldDef[]) =>
    (line.length >= 2 && line.filter((f) => rowOf(f.label)).length <= 1) ||
    (line.length > 0 && !!serial(line[0]) && line.every((f) => serial(f) === serial(line[0])))
      ? `${line[0].position.page}:${line.map(column).sort().join('|')}`
      : ''
  // Line i carries on the table of line i - 1: same columns, and stacked right under it (rows of a table touch;
  // a gap of more than a row is another table, even with the same columns).
  const follows = (i: number) => {
    const [a, b] = [lines[i - 1], lines[i]]
    return !!a && !!b && !!sig(b) && sig(a) === sig(b) && top(b) - bottom(a) < 1.5 * (bottom(a) - top(a))
  }
  const inTable = lines.map((_, i) => follows(i) || follows(i + 1))

  const out: Question[] = []
  // Sections of option grids: a grid's first line finds the heading, the lines right under it share it.
  // A line of boxes with no heading at all ("☐ Full time ☐ Part time ☐ Contract") is one question named by its
  // options, and the next line does not join it (no heading says they belong together).
  const section: (string | undefined)[] = lines.map(() => undefined)
  const headed: boolean[] = lines.map(() => false)
  lines.forEach((line, i) => {
    if (inTable[i] || !isOptions(line)) return
    const prev = lines[i - 1]
    const page = line[0].position.page
    // Rows of the same grid sit closer than 1.5 box heights apart (double-spaced lists too).
    if (
      headed[i - 1] &&
      prev[0].position.page === page &&
      top(line) - bottom(prev) < 1.5 * (bottom(prev) - top(prev))
    ) {
      section[i] = section[i - 1]
      headed[i] = true
      return
    }
    const text = heading(
      textOf(page) ?? [],
      line,
      sorted.filter((f) => f.position.page === page),
    )
    if (text === null) return
    if (text) [section[i], headed[i]] = [text, true]
    else if (line.length > 1)
      section[i] = [...line]
        .sort(byX)
        .map((f) => f.label || f.key)
        .join(' / ')
  })

  lines.forEach((line, i) => {
    const page = line[0].position.page
    const text = textOf(page) ?? []
    // An option grid is one question under its heading; each box is named by its own label.
    const grid = section[i]
    if (grid) {
      const parts = [...line].sort(byX).map((field) => ({ field, name: field.label || field.key }))
      const last = out[out.length - 1]
      if (grid === section[i - 1]) {
        last.parts.push(...parts)
        last.rows!.push(parts.length)
      } else out.push({ id: line[0].id, title: grid, page, parts, rows: [parts.length] })
      return
    }
    // A table is one question laid out as on the document: columns, rows, each row's name on its left.
    if (inTable[i]) {
      const list = [...line].sort(byX)
      const parts = list.map((field) => ({ field, name: column(field) }))
      const name = serial(list[0]) || (list.map((f) => rowOf(f.label)).find(Boolean) ?? rowText(text, list))
      if (!follows(i))
        out.push({
          id: list[0].id,
          title: tableTitle(text, line),
          page,
          parts,
          rows: [parts.length],
          columns: parts.map((p) => p.name),
          rowNames: [name],
        })
      else {
        const t = out[out.length - 1]
        t.parts.push(...parts)
        t.rows!.push(parts.length)
        t.rowNames!.push(name)
      }
      if (follows(i + 1)) return
      // Done: titled by the table's title, else its one side heading ("INSPECTOR"), else its columns.
      const t = out[out.length - 1]
      // Column names repeated, or the table's own title, were not read from the column headers: not shown.
      const cols = t.columns!
      if (cols.some((c, k) => c && (cols.indexOf(c) !== k || cols.lastIndexOf(c) !== k || norm(c) === norm(t.title))))
        t.columns = cols.map(() => '')
      // No names in the labels ("1", "1", "1"): the header row written over the table, when there is one.
      if (t.columns!.every((c) => !c))
        t.columns =
          headerRow(
            text,
            t.parts.slice(0, t.rows![0]).map((p) => p.field),
          ) ?? t.columns
      // One named column ("Best Practices/Safety Related Ideas Identified"): the column's name is the table's.
      if (t.columns!.length === 1 && t.columns![0]) [t.title, t.columns] = [t.columns![0], ['']]
      const named = t.rowNames!.filter(Boolean)
      if (!t.title && named.length === 1 && t.rowNames![0]) t.title = named[0]
      if (named.length === 0 || t.title === t.rowNames![0]) delete t.rowNames
      t.title ||= t.columns!.filter(Boolean).join(' / ') || 'List'
      return
    }
    const groups = new Map<string, FieldDef[]>()
    const loose: FieldDef[] = []
    // "LAST PSC INSPECTION: Place ____  Date ____": the fields after a "Question: Part" field on its line are
    // parts of that question, until another field with its own "…:".
    let lead = ''
    for (const f of [...line].sort(byX)) {
      const r = rowOf(f.label)
      const stem = LEAD.exec(f.label.trim())
      if (!r && stem) lead = `\u0001${stem[1]}`
      else if (r || f.label.includes(':') || COLUMN.test(f.label.trim())) lead = ''
      if (r) groups.set(r, [...(groups.get(r) ?? []), f])
      else if (lead) groups.set(lead, [...(groups.get(lead) ?? []), f])
      else if (COLUMN.test(f.label.trim())) loose.push(f)
      else groups.set(`\u0000${f.id}`, [f]) // a question of its own ("Vessel")
    }
    // Loose column fields join the line's first "Row – Column" question, else make one together.
    const host = [...groups.keys()].find((k) => !k.startsWith('\u0000') && !k.startsWith('\u0001'))
    if (host) groups.get(host)!.push(...loose)
    else if (loose.length) groups.set(loose.map((f) => f.label).join(' / '), loose) // "Yes / No"
    for (const [key, group] of groups) {
      const list = [...group].sort(byX) // left to right, as on the page
      // A name made of the line's column fields ("Yes / No"): no question text of its own.
      const led = key.startsWith('\u0001')
      if (led) {
        const name = (f: FieldDef) => LEAD.exec(f.label.trim())?.[2] ?? (f.label || f.key)
        out.push({
          id: list[0].id,
          title: key.slice(1),
          page,
          parts: list.map((field) => ({ field, name: name(field) })),
        })
        continue
      }
      const generic = !key.startsWith('\u0000') && list.every((f) => !rowOf(f.label))
      let title = key.startsWith('\u0000') ? list[0].label || list[0].key : key
      // The document's own words: in place of names made of columns ("Yes / No"), or where they carry on a label
      // that was cut short ("Were the Master and senior…" → the whole question). Never a different text.
      const written = rowText(text, list)
      const stem = norm(title).replace(/^\d+(\.\d+)*[a-z]?\s+/, '') // "2.1.1 Were the…": the number may sit in its own column
      if (written && (generic || (norm(written).startsWith(stem) && norm(written).length > stem.length)))
        title = written
      out.push({
        id: list[0].id,
        title,
        page,
        parts: list.map((field) => ({
          field,
          name: list.length === 1 && !rowOf(field.label) ? '' : colOf(field.label) || field.key,
        })),
      })
    }
  })
  // Boxes named only by their own label ("Human", "Process") in a row of a table whose text runs on to their
  // right: the row's text says what the box is about.
  for (const q of out) {
    if (q.rows || q.columns || !q.parts.every((p) => p.field.type === 'checkbox' || p.field.type === 'radio')) continue
    if (!q.parts.some((p) => norm(p.field.label) === norm(q.title))) continue
    const text = sideText(
      textOf(q.page) ?? [],
      q.parts.map((p) => p.field),
      sorted.filter((f) => f.position.page === q.page),
    )
    if (!text) continue
    q.title = text
    q.parts = q.parts.map((p) => ({ ...p, name: p.field.label || p.field.key }))
  }
  for (const { fields: list, title } of stacks)
    out.push({
      id: list[0].id,
      title,
      page: list[0].position.page,
      parts: list.map((field) => ({ field, name: field.label })),
      rows: [list.length],
      block: true,
    })
  const at = (q: Question) => top(q.parts.map((p) => p.field).filter((f) => f.position.page === q.page))
  out.sort((a, b) => a.page - b.page || at(a) - at(b))
  if (categoryCode) setCategories(out, sorted, textOf, categoryCode)
  setSections(out, sorted, textOf)
  setScales(out, textOf)
  return mergeBlocks(out)
}

// The text written right of boxes on their line (their own names aside), and its lines wrapped under it, until
// the next box's line or a gap. A wrapped line may start in the boxes' column ("(tick as appropriate) certificates
// and…" read as one line across both columns): the part left of the text's column is cut off, at a word break.
function sideText(lines: TextLine[], boxes: FieldDef[], fields: FieldDef[]) {
  const [y0, y1, x1] = [top(boxes), bottom(boxes), right(boxes)]
  const own = new Set(boxes.map((f) => norm(f.label)))
  const first = lines
    .filter((l) => l.x >= x1 - 0.002 && l.y + l.height / 2 > y0 && l.y + l.height / 2 < y1 && !own.has(norm(l.text)))
    .sort((a, b) => a.x - b.x)[0]
  if (!first) return ''
  const x = first.x
  const others = fields.filter((f) => !boxes.includes(f))
  const out = [first.text.trim()]
  for (let cur = first, k = 0; k < 5; k++) {
    const c = cur
    const next = lines.find(
      (l) =>
        l.y > c.y + c.height / 2 &&
        l.y - (c.y + c.height) < 0.6 * c.height &&
        l.x < x + 0.02 &&
        l.x + l.width > x + 0.02 &&
        !others.some((f) => f.position.y < l.y + l.height && f.position.y + f.position.height > l.y),
    )
    if (!next) break
    let t = next.text.trim()
    if (next.x < x - 0.01) {
      // Cut at the word break nearest to where the column starts, by the share of the line's width.
      const at = Math.round(((x - next.x) / next.width) * t.length)
      const breaks = [...t.matchAll(/ /g)].map((m) => m.index!)
      if (!breaks.length) break
      t = t.slice(breaks.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a)) + 1)
    }
    out.push(t)
    cur = next
  }
  return out.join(' ').replace(/\s+/g, ' ')
}

const BIG: FieldType[] = ['textarea', 'signature', 'file']

// Boxes one under another at the same x, each the only box on its line and named by its own label, with text left of
// them: the options of the question written there. Without text beside them they are a list of options under a
// heading (handled as an option grid).
function findStacks(sorted: FieldDef[], textOf: PageText) {
  const out: { fields: FieldDef[]; title: string }[] = []
  const pages = new Map<number, FieldDef[]>()
  for (const f of sorted) pages.set(f.position.page, [...(pages.get(f.position.page) ?? []), f])
  for (const [page, fs] of pages) {
    const overlaps = (a: FieldDef, b: FieldDef) =>
      a.position.y < b.position.y + b.position.height && a.position.y + a.position.height > b.position.y
    const isBox = (f: FieldDef) => f.type === 'checkbox' || f.type === 'radio'
    // Alone among boxes on its line (a row "☐ Y ☐ N ☐ NA" is not a column); a text box beside it may share it.
    const boxes = fs.filter((f) => isBox(f) && f.label.trim() && !fs.some((o) => o !== f && isBox(o) && overlaps(o, f)))
    const used = new Set<FieldDef>()
    for (const f of boxes) {
      if (used.has(f)) continue
      const stack = [f]
      for (const g of boxes) {
        const p = stack[stack.length - 1].position
        if (
          g.position.y > p.y &&
          Math.abs(g.position.x - f.position.x) < 0.006 &&
          g.position.y - (p.y + p.height) < p.height
        )
          stack.push(g)
      }
      if (stack.length < 2) continue
      const title = blockText(textOf(page) ?? [], stack, fs)
      if (!title) continue
      stack.forEach((g) => used.add(g))
      out.push({ fields: stack, title })
    }
  }
  return out
}

// The text block left of a column of boxes: the lines beside it, and the lines set tight above and below them,
// up to a category code or numbered heading above and a big answer box (a "Finding" textarea) below. Lines
// carried on in lower case join the line before; the others ("A1.", "A2.", "● …") start their own line.
function blockText(lines: TextLine[], stack: FieldDef[], fields: FieldDef[]) {
  const x = left(stack)
  const [y0, y1] = [top(stack), bottom(stack)]
  const own = new Set(stack.map((f) => norm(f.label)))
  const big = fields.filter((f) => BIG.includes(f.type))
  const stop = (l: TextLine) =>
    (CODE.test(l.text.trim()) && !COLUMN.test(l.text.trim())) ||
    NUMBERED.test(l.text.trim()) ||
    !!tagsOf(l.text) ||
    big.some((f) => f.position.y < l.y + l.height && f.position.y + f.position.height > l.y)
  const col = lines.filter((l) => l.x + l.width <= x + 0.005 && !own.has(norm(l.text))).sort((a, b) => a.y - b.y)
  const beside = (l: TextLine) => l.y + l.height / 2 > y0 && l.y + l.height / 2 < y1
  let i = col.findIndex(beside)
  let j = col.length - 1 - [...col].reverse().findIndex(beside)
  if (i < 0) return ''
  const tight = (a: TextLine, b: TextLine) => b.y - (a.y + a.height) < 1.2 * Math.max(a.height, b.height)
  // The first box may sit level with the category code ("HF" │ ☐ Excd. Expectation): the text starts under it.
  for (let k = j; k >= i; k--)
    if (stop(col[k])) {
      if (k === j && (k + 1 >= col.length || !tight(col[k], col[k + 1]) || stop(col[k + 1]))) return ''
      i = k + 1
      j = Math.max(j, i)
      break
    }
  while (i > 0 && !stop(col[i - 1]) && tight(col[i - 1], col[i])) i--
  while (j < col.length - 1 && !stop(col[j + 1]) && tight(col[j], col[j + 1])) j++
  return col
    .slice(i, j + 1)
    .map((l) => l.text.trim())
    .reduce((a, t) => (!a ? t : /^\p{Ll}/u.test(t) ? `${a} ${t}` : `${a}\n${t}`), '')
}

// With categories, a question's parts under one category heading of one numbered question are one card: the
// column of options with its text, then the "Finding" box under it. Two option grids are joined only across a
// page break (the options of one column split over two pages), into one row.
function mergeBlocks(out: Question[]) {
  if (!out.some((q) => q.category)) return out
  const size = (q: Question) => q.rows?.reduce((x, y) => x + y, 0) ?? 0
  const res: Question[] = []
  for (const q of out) {
    const last = res[res.length - 1]
    const same =
      last &&
      q.category &&
      last.category === q.category &&
      last.section === q.section &&
      !q.columns &&
      !last.columns &&
      (!(q.rows && last.rows) || q.page !== last.page)
    if (!same) {
      res.push(q)
      continue
    }
    const grid = [...last.parts.slice(0, size(last)), ...q.parts.slice(0, size(q))]
    res[res.length - 1] = {
      ...last,
      title: q.block && !last.block ? q.title : last.title,
      parts: [...grid, ...last.parts.slice(size(last)), ...q.parts.slice(size(q))],
      rows: q.rows && last.rows ? [grid.length] : (last.rows ?? q.rows),
      block: last.block || q.block,
    }
  }
  return res
}

// A category code written as a heading of its own over blocks of questions ("HW" / "PR" / "HF").
const CODE = /^[A-Z]{2,4}$/

// Codes first on their line, with no other code after them (a header row "RANK NAME DATE" is not), and not a
// running header or footer (same text at the same height on 3+ pages). The form has categories when at
// least two codes come back at least twice each; a question takes the last one above it, across page breaks.
function setCategories(out: Question[], fields: FieldDef[], textOf: PageText, code: RegExp) {
  const last = Math.max(0, ...fields.map((f) => f.position.page))
  const found: { page: number; y: number; code: string }[] = []
  const isCode = (t: string) => code.test(t.trim()) && !COLUMN.test(t.trim())
  for (let page = 1; page <= last; page++) {
    const lines = textOf(page) ?? []
    for (const l of lines) {
      if (!isCode(l.text)) continue
      const beside = lines.filter((o) => o !== l && o.y < l.y + l.height && o.y + o.height > l.y)
      if (beside.some((o) => o.x < l.x || isCode(o.text))) continue
      found.push({ page, y: l.y, code: l.text.trim() })
    }
  }
  const marks = found.filter(
    (m) => found.filter((o) => o.page !== m.page && o.code === m.code && Math.abs(o.y - m.y) < 0.003).length < 2,
  )
  const times = new Map<string, number>()
  for (const m of marks) times.set(m.code, (times.get(m.code) ?? 0) + 1)
  if ([...times.values()].filter((t) => t >= 2).length < 2) return
  for (const q of out) q.category = lastAbove(q, marks)?.code
}

// The last mark (in document order) above a question, by its middle: a cell's answer boxes are centred in it,
// the first one may start above the heading.
function lastAbove<T extends { page: number; y: number }>(q: Question, marks: T[]) {
  const own = q.parts.map((p) => p.field).filter((f) => f.position.page === q.page)
  const y = (top(own) + bottom(own)) / 2
  return marks.filter((m) => m.page < q.page || (m.page === q.page && m.y <= y)).at(-1)
}

// A numbered heading: "2.1.1 Maintenance of statutory Certificates" (two levels at least: "1. Vessel free…" is an
// item inside a question; "5.9.2 / 5.10.2" is an index).
const NUMBERED = /^\d+(\.\d+)+\.?\s+\p{L}/u

// Numbered headings first on their line, with no field on it (a line with fields is a question itself): each
// question shows the heading it answers, carried over page breaks.
function setSections(out: Question[], fields: FieldDef[], textOf: PageText) {
  const last = Math.max(0, ...fields.map((f) => f.position.page))
  const marks: { page: number; y: number; text: string }[] = []
  for (let page = 1; page <= last; page++) {
    const lines = textOf(page) ?? []
    const boxes = fields.filter((f) => f.position.page === page)
    const edge = Math.max(0, ...lines.map((o) => o.x + o.width))
    for (const l of lines) {
      const text = l.text.trim().replace(/\s+/g, ' ')
      if (!NUMBERED.test(text)) continue
      const across = (y: number, h: number) => y < l.y + l.height && y + h > l.y
      if (lines.some((o) => o !== l && o.x < l.x && across(o.y, o.height))) continue
      const free = (t: TextLine) =>
        !boxes.some((f) => f.position.y < t.y + t.height && f.position.y + f.position.height > t.y)
      if (!free(l)) continue
      // A heading wrapped onto the lines set tight under it: a line that ran to the text's right edge without
      // ending its sentence, or one the next line carries on in lower case (not a "Note:" after the heading).
      // Only lines in the heading's own text size: a picture's caption or watermark ("Sampl") is not part of it.
      // A heading cut by a picture or a box ("…was it free of" [photo] "any areas for concern?") carries on in the
      // first line of its size at its x under it, when that line starts in lower case and no field comes between.
      const parts = [text]
      const same = (o: TextLine) => Math.abs(o.height - l.height) < 0.3 * l.height
      for (let cur = l, k = 0; k < 4; k++) {
        const c = cur
        if (/[?.:!)]$/.test(c.text.trim())) break
        let next = lines.find(
          (o) =>
            o.y > c.y &&
            o.y - (c.y + c.height) < 0.5 * c.height &&
            o.x >= l.x - 0.01 &&
            o.x < l.x + l.width &&
            same(o) &&
            !NUMBERED.test(o.text.trim()) &&
            free(o),
        )
        if (next && !/^\p{Ll}/u.test(next.text.trim()) && c.x + c.width < l.x + 0.85 * (edge - l.x)) break
        if (!next) {
          const below = lines
            .filter((o) => o.y > c.y + c.height && Math.abs(o.x - l.x) < 0.01 && same(o))
            .sort((a, b) => a.y - b.y)[0]
          const between = boxes.some((f) => f.position.y > c.y && f.position.y < (below?.y ?? 0))
          if (below && /^\p{Ll}/u.test(below.text.trim()) && free(below) && !between) next = below
        }
        if (!next) break
        parts.push(next.text.trim())
        cur = next
      }
      marks.push({ page, y: l.y, text: parts.join(' ').replace(/\s+/g, ' ') })
    }
  }
  // A numbered question's tags line (anywhere under its heading) applies to all of its questions. Only keys that
  // come back in two numbered questions or more are kept: a one-off "Name: …, Date: …" line is not a filter.
  const tagged = new Map<(typeof marks)[number], Record<string, string>>()
  for (let page = 1; page <= last; page++)
    for (const l of textOf(page) ?? []) {
      const tags = tagsOf(l.text)
      const mark = tags && marks.filter((m) => m.page < page || (m.page === page && m.y < l.y)).at(-1)
      if (mark) tagged.set(mark, { ...tagged.get(mark), ...tags })
    }
  const seen = new Map<string, number>()
  for (const t of tagged.values()) for (const k of Object.keys(t)) seen.set(k, (seen.get(k) ?? 0) + 1)
  for (const q of out) {
    const mark = lastAbove(q, marks)
    q.section = mark?.text
    if (q.section && !q.rows && !q.columns) pieceTitle(q, q.section, textOf(q.page) ?? [])
    const tags = Object.entries((mark && tagged.get(mark)) ?? {}).filter(([k]) => seen.get(k)! >= 2)
    if (tags.length) q.tags = Object.fromEntries(tags)
  }
}

// Letters that look the same in other scripts ("Ν/S" typed with a Greek Ν), so a choice matches its legend.
const LOOKALIKE: Record<string, string> = {
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  Ζ: 'Z',
}
const fold = (t: string) =>
  t
    .replace(/[ΑΒΕΗΙΚΜΝΟΡΤΥΧΖ]/g, (c) => LOOKALIKE[c])
    .trim()
    .toLowerCase()
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Rows answered on the same scale, one under another ("Chapter 02 … ☐1 ☐2 ☐3 ☐4 ☐5 ☐N/S"): the text set tight
// above the first row says what they ask (its column names aside), and a legend on the page ("5 “excellent”
// means…", "1 = Poor") says what each choice means, written after the choice's name ("5 – excellent").
function setScales(out: Question[], textOf: PageText) {
  for (let i = 0; i < out.length; ) {
    const choices = choicesOf(out[i]).map(fold)
    let j = i + 1
    while (
      choices.length >= 2 &&
      j < out.length &&
      out[j].page === out[i].page &&
      choicesOf(out[j]).map(fold).join('|') === choices.join('|')
    )
      j++
    if (j - i >= 2) scale(out.slice(i, j), choices, textOf)
    i = j
  }
}

function scale(run: Question[], choices: string[], textOf: PageText) {
  const first = run[0]
  const lines = textOf(first.page) ?? []
  const y0 = top(first.parts.map((p) => p.field))
  const isHeader = (l: TextLine) => l.text.split(/\s+/).every((w) => choices.includes(fold(w)))
  const above = lines.filter((l) => l.y + l.height <= y0 + 0.002 && !isHeader(l)).sort((a, b) => b.y - a.y)
  const block: TextLine[] = []
  for (const l of above) {
    const below = block[block.length - 1]
    const gap = (below ? below.y : y0) - (l.y + l.height)
    if (gap > 1.2 * l.height || block.length === 3) break
    block.push(l)
  }
  const intro = block
    .reverse()
    .map((l) => l.text.trim())
    .join(' ')
  if (intro && !run.some((q) => norm(q.title) === norm(intro))) for (const q of run) q.intro = intro

  // The legend: lines that start with a choice's name, on this page or the next.
  const legend = new Map<string, string>()
  for (const l of [...lines, ...(textOf(first.page + 1) ?? [])]) {
    // A bullet before it may be a symbol font's private-use glyph (U+F0B7).
    const t = l.text.replace(/^[\s\p{Co}•●▪■◦*–-]+/u, '').trim()
    for (const c of choices) {
      if (legend.has(c)) continue
      const m = new RegExp(`^${escape(c)}\\s*(?:[=:–-]\\s*|\\s)(\\S.*)$`, 'i').exec(fold(t))
      if (!m) continue
      const rest = t.slice(t.length - m[1].length)
      const said =
        /[“"‘]([^”"’]{1,40})[”"’]/.exec(rest)?.[1] ??
        rest
          .split(/\s+means\s+/i)[0]
          .split(/\s+/)
          .slice(0, 6)
          .join(' ')
      legend.set(c, said.replace(/[.,;:]$/, ''))
    }
  }
  if (legend.size < Math.max(2, Math.ceil(0.6 * choices.length))) return
  for (const q of run)
    q.parts = q.parts.map((p) => {
      const said = legend.get(fold(p.name))
      return p.field.type === 'checkbox' && said ? { ...p, name: `${p.name} – ${said}` } : p
    })
}

// A card titled by a piece of its numbered question ("any areas for concern?", or the question cut short in a
// label): the question is in the heading over it, so the card is named by what its box is, the "Comments:" written
// on the box's line, else its part's name.
function pieceTitle(q: Question, section: string, lines: TextLine[]) {
  const title = norm(q.title).replace(/[…]+$/, '')
  if (!title || !norm(section).includes(title)) return
  const f = q.parts[0].field
  const label = lines.find(
    (l) =>
      /^[^:]{1,30}:$/.test(l.text.trim()) && l.y < f.position.y + f.position.height && l.y + l.height > f.position.y,
  )
  const name = label?.text.trim().slice(0, -1) || (q.parts.length === 1 ? q.parts[0].name : '')
  if (!name) return
  q.title = name
  if (q.parts.length === 1 && norm(q.parts[0].name) === norm(name)) q.parts = [{ ...q.parts[0], name: '' }]
}

// "Key: Value , Key: Value": two pairs at least, short keys (up to 3 words) and values.
const PAIR = /^\s*(\p{L}[\p{L} ]{0,24}?)\s*:\s*([^,:]{1,40}?)\s*$/u
function tagsOf(text: string) {
  const parts = text.split(',')
  if (parts.length < 2) return null
  const pairs = parts.map((p) => PAIR.exec(p))
  if (pairs.some((m) => !m || m[1].trim().split(/\s+/).length > 3)) return null
  return Object.fromEntries(pairs.map((m) => [m![1].trim(), m![2].trim()]))
}

export const isFilled = (v: AnswerValue | undefined) => v != null && v !== '' && v !== false

// The boxes that are a question's answer choices: its option grid, else its boxes ("Y / N / NA" on one line, or
// a lone "☐ Human").
function choiceParts(q: Question) {
  if (q.columns) return []
  const size = q.rows?.reduce((a, b) => a + b, 0) ?? 0
  const boxes = (q.rows ? q.parts.slice(0, size) : q.parts).filter((p) => p.field.type === 'checkbox')
  return boxes
}
const radioOf = (q: Question) => q.parts.find((p) => p.field.type === 'radio' && p.field.options?.length)?.field

/** A question's answer choices ("Yes", "No", "NA"), from its boxes or its radio buttons. */
export function choicesOf(q: Question): string[] {
  const boxes = choiceParts(q)
  if (boxes.length) return boxes.map((p) => (p.name || p.field.label).trim())
  return radioOf(q)?.options ?? []
}

/** The choices ticked in a question's answers. */
export function pickedOf(q: Question, answers: Answers): string[] {
  const boxes = choiceParts(q)
  if (boxes.length)
    return boxes.filter((p) => answers[p.field.key] === true).map((p) => (p.name || p.field.label).trim())
  const radio = radioOf(q)
  const v = radio && answers[radio.key]
  return typeof v === 'string' && v ? [v] : []
}
