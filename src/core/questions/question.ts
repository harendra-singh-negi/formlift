// What a question is (fields on one line of the document that belong together), and the small helpers every step
// uses: a label's row and column part ("Row – Column"), and where a set of fields sits.

import type { FieldDef } from '../form-logic'
import type { TextLine } from '../layout'

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
  /** "Classification: Core , Risk: H , Assigned to: MANAGER" written in its numbered question: filters. */
  tags?: Record<string, string>
  /** What a run of rows with the same choices asks ("Evaluation of the level of compliance…"), shown over them. */
  intro?: string
  /** The document's text around it in the list (its flow segment), for search. */
  text?: string
}

/** Text lines of a form page (page fractions, top-left origin, as field positions), when known. */
export type PageText = (page: number) => TextLine[] | undefined

// "Row – Column" labels (auto-detect, or typed that way): the row is the question, the column names the part.
export const SEP = ' – '
export const rowOf = (label: string) => (label.includes(SEP) ? label.slice(0, label.lastIndexOf(SEP)) : null)
export const colOf = (label: string) => (label.includes(SEP) ? label.slice(label.lastIndexOf(SEP) + SEP.length) : label)
// A field named only like a column (Y, No, Remarks…) belongs to the question on its line.
// A row number: "1", "2.", "3)", "a)", "iv."
export const SERIAL = /^(\d{1,3}|[a-z]|[ivx]{1,5})[.)]?$/i
export const COLUMN = /^(y|n|n ?a|yes|no|remarks?|comments?|observations?|notes?)$/i

// "LAST FIRE INSPECTION: Place": a question and the name of its first part.
export const LEAD = /^(.+?):\s+(\S.*)$/

export const byX = (a: FieldDef, b: FieldDef) => a.position.x - b.position.x
export const norm = (s: string) =>
  s
    .replace(/[:.\s…]+$/, '')
    .trim()
    .toLowerCase()
export const top = (fs: FieldDef[]) => Math.min(...fs.map((f) => f.position.y))
export const bottom = (fs: FieldDef[]) => Math.max(...fs.map((f) => f.position.y + f.position.height))
export const left = (fs: FieldDef[]) => Math.min(...fs.map((f) => f.position.x))
export const right = (fs: FieldDef[]) => Math.max(...fs.map((f) => f.position.x + f.position.width))
