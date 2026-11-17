// The flow's shapes: text runs with their look, pictures, paragraphs, table cells and blocks, a page as read from
// pdf.js, and the segments the list view shows.

import type { FieldDef } from '../form-logic'

/** Text with its look. Colours are #rrggbb; left out = the text's normal ink, no highlight. */
export interface FlowRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  font?: 'serif' | 'mono'
  color?: string
  /** Highlight behind the text. */
  bg?: string
  /** Size relative to its paragraph, when it differs. */
  size?: number
}

/** A picture: its box on its original PDF page (`source`), in page fractions, to cut from the drawn page. */
export interface FlowImage {
  source: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * A piece of a paragraph: text, a field's answer control, or a picture. `w` / `h` are its size on the page in ems
 * of the page's body text, so it keeps its size next to the text. `caption`: nothing written on the page around it
 * names the field (a scanned page, an empty table cell): show its label with it.
 */
export type FlowPart =
  | FlowRun
  | { field: FieldDef; w: number; h: number; caption?: boolean }
  | { image: FlowImage; w: number; h: number }

export interface FlowPara {
  parts: FlowPart[]
  /** Text size relative to the page's body text. */
  size: number
  align?: 'center' | 'right'
}

/**
 * A cell of a table row or a shaded bar, or a thing on a line (`FlowBlock.line`): its width and its gap from the
 * one before, in % of the page's content.
 */
export interface FlowCell {
  width: number
  offset: number
  fill?: string
  paras: FlowPara[]
}

export interface FlowBlock {
  /** The form's page (as in field positions). */
  page: number
  /** Top and bottom on the page, page fractions. */
  y: number
  bottom: number
  /** Space above it on the page. */
  gap?: boolean
  /** A table row: cells side by side (one under another on a narrow screen)… */
  cells?: FlowCell[]
  /**
   * …or with `line`, a line of the page without rules: its text and fields side by side, each at its place
   * ("SITE: ___   ID: ___", a row of answer lines under column names); on a narrow screen they wrap like words…
   */
  line?: boolean
  /** …or free text: paragraphs one under another. */
  paras?: FlowPara[]
}

/** A PDF page read for the flow, in points from its top left (readPage). The same for every form using the page. */
export interface PageRead {
  width: number
  height: number
  /** Text with its look; `base` = baseline, `pt` = font size. */
  items: { run: FlowRun; x: number; w: number; base: number; pt: number }[]
  /** Ruled table cells and shaded bars, with their fill. */
  boxes: { x0: number; y0: number; x1: number; y1: number; fill?: string }[]
  /** Pictures. */
  images: { x: number; y: number; w: number; h: number }[]
}

/** A stretch of the flow and the questions answered in it: what the list shows for one entry. */
export interface FlowSegment {
  blocks: FlowBlock[]
  /** Ids of its questions. */
  questions: string[]
}
