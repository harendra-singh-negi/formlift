import type { FieldDef, Layout, LayoutElement } from './form-logic'
import { fitInPage } from './coords'

/** A field list and a layout, changed together (page moves renumber both). */
export interface Doc {
  fields: FieldDef[]
  layout: Layout
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `e${Date.now()}${Math.random()}`

/** Renumbers every field and element through `map` (old page → new page, or null = gone with its page). */
function remap(doc: Doc, pages: Layout['pages'], map: (page: number) => number | null): Doc {
  return {
    fields: doc.fields.flatMap((f) => {
      const page = map(f.position.page)
      return page == null ? [] : [{ ...f, position: { ...f.position, page } }]
    }),
    layout: {
      pages,
      elements: doc.layout.elements.flatMap((e) => {
        const page = map(e.page)
        return page == null ? [] : [{ ...e, page }]
      }),
    },
  }
}

/** Swaps page `n` (1-based) with its neighbour above (-1) or below (+1). */
export function movePage(doc: Doc, n: number, step: -1 | 1): Doc {
  const m = n + step
  if (m < 1 || m > doc.layout.pages.length) return doc
  const pages = [...doc.layout.pages]
  ;[pages[n - 1], pages[m - 1]] = [pages[m - 1], pages[n - 1]]
  return remap(doc, pages, (p) => (p === n ? m : p === m ? n : p))
}

/** Removes page `n` with the fields and items on it. */
export function deletePage(doc: Doc, n: number): Doc {
  if (doc.layout.pages.length <= 1) return doc
  const pages = doc.layout.pages.filter((_, i) => i !== n - 1)
  return remap(doc, pages, (p) => (p === n ? null : p > n ? p - 1 : p))
}

/** Adds a blank page after page `n` (0 = at the start), the size of page `n` (or of the first page). */
export function insertBlankPage(doc: Doc, n: number): Doc {
  const like = doc.layout.pages[Math.max(0, n - 1)] ?? { width: 595, height: 842 }
  const pages = [...doc.layout.pages]
  pages.splice(n, 0, { source: null, width: like.width, height: like.height })
  return remap(doc, pages, (p) => (p > n ? p + 1 : p))
}

/** What each layout tool draws when dropped. */
export const ELEMENT_TOOLS = {
  text: { label: 'Text', size: [0.3, 0.025], make: { type: 'text', text: 'New text', fontSize: 11 } },
  box: { label: 'Box', size: [0.3, 0.08], make: { type: 'box', stroke: '#000000', strokeWidth: 1 } },
  whiteout: { label: 'White-out (hide)', size: [0.2, 0.03], make: { type: 'box', fill: '#ffffff' } },
  line: { label: 'Line', size: [0.3, 0], make: { type: 'line', stroke: '#000000', strokeWidth: 1 } },
} as const satisfies Record<string, { label: string; size: [number, number]; make: Partial<LayoutElement> }>
export type ElementTool = keyof typeof ELEMENT_TOOLS

/** A new item from a tool, centred on the dropped point. */
export function newElement(tool: ElementTool, page: number, x: number, y: number): LayoutElement {
  const t = ELEMENT_TOOLS[tool]
  const [width, height] = t.size
  const p = fitInPage({ page, x: x - width / 2, y: y - height / 2, width, height: Math.max(height, 0.01) })
  return { id: newId(), page, ...t.make, position: { x: p.x, y: p.y, width, height } } as LayoutElement
}

/** A text item that hides an original line and shows `line.text` (editable) in its place. */
export function replaceLine(line: TextLine, page: number): LayoutElement {
  return {
    id: newId(),
    type: 'text',
    page,
    // A little bigger than the glyphs so no edge of the original shows through.
    position: fitInPage({
      page,
      x: line.x - 0.002,
      y: line.y - 0.002,
      width: Math.min(1, line.width + 0.006),
      height: Math.min(1, line.height + 0.004),
    }),
    text: line.text,
    fontSize: Math.round(line.fontSize * 10) / 10,
    fill: '#ffffff',
    replaces: line.text,
    ...(line.bold && { bold: true }),
    ...(line.italic && { italic: true }),
  }
}

/** Text width in points: canvas measureText in the browser; injectable for tests. */
export type Measure = (text: string, e: LayoutElement) => number
let canvas: HTMLCanvasElement | null = null
export const measureText: Measure = (text, e) => {
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  const family = {
    sans: 'Helvetica, Arial, sans-serif',
    serif: 'Times New Roman, Times, serif',
    mono: 'Courier New, monospace',
  }
  ctx.font = `${e.italic ? 'italic ' : ''}${e.bold ? 'bold ' : ''}${e.fontSize ?? 10}px ${family[e.font ?? 'sans']}`
  return ctx.measureText(text).width
}

/**
 * Widens a text item to fit its longest line (never narrower, never past the page edge), so new text that is
 * longer than the line it replaces is not cut off. `pageWidth` in points.
 */
export function fitTextWidth(e: LayoutElement, pageWidth: number, measure: Measure = measureText): LayoutElement {
  if (e.type !== 'text' || !e.text) return e
  const longest = Math.max(...e.text.split('\n').map((l) => measure(l, e)))
  const needed = (longest + 4) / pageWidth
  if (needed <= e.position.width) return e
  return { ...e, position: { ...e.position, width: Math.min(needed, 1 - e.position.x) } }
}

export const duplicateElement = (e: LayoutElement): LayoutElement => ({
  ...structuredClone(e),
  id: newId(),
  replaces: undefined,
  position: { ...e.position, y: Math.min(1 - e.position.height, e.position.y + e.position.height + 0.005) },
})

// ---------- lines of text in the original PDF ----------

/** One line (or column cell) of original text, in page fractions; fontSize in points. */
export interface TextLine {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  bold?: boolean
  italic?: boolean
}

/** pdf.js text item: transform = [a, b, c, d, e, f] in PDF space, width in PDF units. */
export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  fontName?: string
}

/**
 * Groups pdf.js text items into lines. Items on the same baseline join when the gap between them is small (a
 * space); a wide gap (another column, a table cell) starts a new line. `viewBox` = [x0, y0, x1, y1] of the page.
 */
export function toLines(
  items: PdfTextItem[],
  viewBox: number[],
  /** The real font name of a pdf.js font id ('ABCDEF+Arial-BoldMT'), to tell bold / italic text. */
  fontOf: (id: string) => string | undefined = () => undefined,
): TextLine[] {
  const [x0, y0, x1, y1] = viewBox
  const W = x1 - x0
  const H = y1 - y0
  const glyphs = items
    // Horizontal text only. Whitespace items are dropped: some PDFs fill the gap between columns with one wide
    // space item, which would join "SHIP:" and "GT:" into one line; the gap rule below adds word spaces back.
    .filter((i) => i.str.trim().length && Math.abs(i.transform[1]) < 0.01)
    .map((i) => {
      const size = Math.hypot(i.transform[2], i.transform[3]) || 1
      const font = (i.fontName && fontOf(i.fontName)) || ''
      return {
        str: i.str,
        x: i.transform[4] - x0,
        base: y1 - i.transform[5],
        w: i.width,
        size,
        bold: /bold|black|heavy|semibold|demi/i.test(font),
        italic: /italic|oblique/i.test(font),
      }
    })
    .sort((a, b) => a.base - b.base || a.x - b.x)

  const lines: { text: string; x: number; end: number; base: number; size: number; bold: boolean; italic: boolean }[] =
    []
  for (const g of glyphs) {
    const last = lines[lines.length - 1]
    const sameLine = last && Math.abs(g.base - last.base) < Math.max(g.size, last.size) * 0.4
    const gap = last ? g.x - last.end : Infinity
    if (sameLine && gap < Math.max(g.size, last.size) * 1.5 && gap > -last.size) {
      last.text += gap > g.size * 0.15 && !last.text.endsWith(' ') && !g.str.startsWith(' ') ? ' ' + g.str : g.str
      last.end = Math.max(last.end, g.x + g.w)
      last.size = Math.max(last.size, g.size)
    } else
      lines.push({ text: g.str, x: g.x, end: g.x + g.w, base: g.base, size: g.size, bold: g.bold, italic: g.italic })
  }
  return lines
    .map((l) => ({ ...l, text: l.text.trim() }))
    .filter((l) => l.text)
    .map((l) => ({
      text: l.text,
      x: l.x / W,
      y: (l.base - l.size * 0.92) / H,
      width: (l.end - l.x) / W,
      height: (l.size * 1.18) / H,
      fontSize: l.size,
      ...(l.bold && { bold: true }),
      ...(l.italic && { italic: true }),
    }))
}
