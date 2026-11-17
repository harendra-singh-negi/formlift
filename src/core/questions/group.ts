// toQuestions: the form's fields grouped into questions, in document order. Fields on one line that belong
// together are one question; grids of boxes and tables are one question each, laid out in rows and columns.

import type { FieldDef, FieldType } from '../form-logic'
import type { TextLine } from '../layout'
import { bottom, byX, colOf, COLUMN, LEAD, left, norm, type PageText, type Question, rowOf, SERIAL, top } from './question'
import { setScales } from './scales'
import { CODE, NUMBERED, setCategories, setSections, tagsOf } from './sections'
import { headerRow, heading, isOptions, rowText, sideText, tableTitle } from './titles'

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
  // Columns of boxes beside a block of text ("A. Site is free of: A1… A4…" │ ☐ Yes ☐ No ☐ NA): one question each.
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
  // Tables: lines of fields named by their columns ("ROLE", "NAME", "SIGNATURE", "DATE"), repeated on the line
  // above or below with the same columns. A row may carry the table's side heading on one field ("INSPECTOR
  // – ROLE"); lines whose fields all share a row name ("2.1.1 … – Y / N") are questions, not table rows.
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
    // "LAST FIRE INSPECTION: Place ____  Date ____": the fields after a "Question: Part" field on its line are
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
      else groups.set(`\u0000${f.id}`, [f]) // a question of its own ("Site")
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
      // that was cut short ("Were the Manager and senior…" → the whole question). Never a different text.
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

export const BIG: FieldType[] = ['textarea', 'signature', 'file']

// Boxes one under another at the same x, each the only box on its line and named by its own label, with text left of
// them: the options of the question written there. Without text beside them they are a list of options under a
// heading (handled as an option grid).
export function findStacks(sorted: FieldDef[], textOf: PageText) {
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
export function blockText(lines: TextLine[], stack: FieldDef[], fields: FieldDef[]) {
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
export function mergeBlocks(out: Question[]) {
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
