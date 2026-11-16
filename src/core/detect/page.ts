// Reading a pdf.js page for detection: what it draws (with typed boxes and "____" runs), its text, and whether a
// box sits on its drawing.

import type { Position } from '../form-logic'
import { overlap } from '../coords'
import { extractShapes, splitBoxChars, splitUnderscores, type Ops, type Seg, type Shapes } from './shapes'

export interface PdfPage {
  view: number[]
  getOperatorList(o?: { intent?: string; annotationMode?: number }): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  getTextContent(): Promise<{ items: unknown[] }>
  getAnnotations?(): Promise<unknown[]>
}
/** What detection needs from a pdf.js document (PDFDocumentProxy). */
export interface PdfDoc {
  getPage(n: number): Promise<PdfPage>
}
type Item = { str: string; transform: number[]; width: number }

/** A page as detection reads it: what it draws (with typed boxes and "____" runs) and its text without them. */
export async function readDrawing(page: PdfPage, OPS: Ops) {
  // 'print' intent: its operator list is not the one the canvas renderer caches and rewrites. Annotations left out
  // (pdf.js AnnotationMode.DISABLE): a fillable field's look is not the page's drawing (and comes out of place here).
  const ops = await page.getOperatorList({ intent: 'print', annotationMode: 0 })
  const text = await page.getTextContent()
  const split = splitBoxChars(text.items as Item[], page.view)
  const typed = splitUnderscores(split.items, page.view)
  const drawn = extractShapes(ops.fnArray, ops.argsArray as unknown[][], OPS, page.view)
  const size = { width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] }
  return { drawn, shapes: { ...drawn, rects: [...drawn.rects, ...split.boxes] }, typed, size }
}

/**
 * Whether a box (page fractions) sits on a page's drawing: an edge of it on a line, on a box's edge or on a table
 * wall. `typed`: the page's "____" runs.
 */
export function onDrawing(shapes: Shapes, typed: Seg[], size: { width: number; height: number }) {
  // Lines as [where, from, to]; a box's edges are lines too.
  const h = [
    ...[...shapes.hlines, ...typed].map((l) => [l.y0, l.x0, l.x1]),
    ...shapes.rects.flatMap((r) => [r.y, r.y + r.h].map((y) => [y, r.x, r.x + r.w])),
  ]
  const v = [
    ...shapes.vlines.map((l) => [l.x0, l.y0, l.y1]),
    ...shapes.rects.flatMap((r) => [r.x, r.x + r.w].map((x) => [x, r.y, r.y + r.h])),
  ]
  const near = (a: number, b: number) => Math.abs(a - b) < 4
  return (p: Position) => {
    const [x0, y0] = [p.x * size.width, p.y * size.height]
    const [x1, y1] = [x0 + p.width * size.width, y0 + p.height * size.height]
    return (
      h.some(([y, a, b]) => (near(y, y0) || near(y, y1)) && overlap(a, b, x0, x1) > 0.5 * (x1 - x0)) ||
      v.some(([x, a, b]) => (near(x, x0) || near(x, x1)) && overlap(a, b, y0, y1) > 0.5 * (y1 - y0))
    )
  }
}
