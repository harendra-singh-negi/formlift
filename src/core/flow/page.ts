// pageFlow: one page as blocks in reading order (paragraphs, tables, pictures, fields where they sit).

import type { FieldDef, LayoutElement } from '../form-logic'
import { lineCells, paragraphs } from './paragraphs'
import { BLANK, BOX, isText, type Item, piecesOf, round, round4 } from './pieces'
import { area, type Box, isInk, within } from './read'
import type { FlowBlock, FlowCell, FlowRun, PageRead } from './types'

/**
 * One page of the form as blocks in reading order: the page read by readPage (none for a blank page), the fields
 * on it (not dialogOnly ones) and the layout's elements on it (the admin's text; white-outs hide what they cover).
 * `page` = the form's page number, its original page (`source`) and size in points.
 */
export function pageFlow(
  read: PageRead | undefined,
  page: { page: number; source: number | null; width: number; height: number },
  fields: FieldDef[],
  elements: LayoutElement[] = [],
): FlowBlock[] {
  const { width: W, height: H } = page
  const boxOf = (p: { x: number; y: number; width: number; height: number }): Box => ({
    x0: p.x * W,
    y0: p.y * H,
    x1: (p.x + p.width) * W,
    y1: (p.y + p.height) * H,
  })
  const covers = elements.filter((e) => e.type !== 'line' && e.fill).map((e) => boxOf(e.position))
  const hidden = (x: number, y: number) => covers.some((b) => within(b, x, y))

  const items: Item[] = []
  for (const t of read?.items ?? [])
    if (!hidden(t.x + t.w / 2, t.base - t.pt / 3))
      items.push({ part: { ...t.run }, x: t.x, w: t.w, base: t.base, top: t.base - t.pt, pt: t.pt })
  for (const e of elements) {
    if (e.type !== 'text' || !e.text) continue
    const b = boxOf(e.position)
    const pt = e.fontSize ?? 11
    e.text.split('\n').forEach((line, i) => {
      if (!line.trim()) return
      const base = b.y0 + (i + 0.85) * pt * 1.2
      const run: FlowRun = { text: line }
      if (e.bold) run.bold = true
      if (e.italic) run.italic = true
      if (e.font && e.font !== 'sans') run.font = e.font
      if (e.color && !isInk(e.color)) run.color = e.color
      items.push({ part: run, x: b.x0, w: b.x1 - b.x0, base, top: base - pt, pt })
    })
  }
  // The body text's size (the size most characters have): fields and pictures are measured in it.
  const bySize = items.filter((i) => isText(i.part)).sort((a, b) => a.pt - b.pt)
  const chars = bySize.reduce((n, i) => n + (i.part as FlowRun).text.length, 0)
  let body = 10
  for (let n = 0, i = 0; i < bySize.length; i++)
    if ((n += (bySize[i].part as FlowRun).text.length) >= chars / 2) {
      body = bySize[i].pt
      break
    }

  const spots = fields.map((f) => boxOf(f.position))
  for (const it of items) {
    if (!isText(it.part) || !spots.some((b) => it.x < b.x1 && it.x + it.w > b.x0 && it.top < b.y1 && it.base > b.y0))
      continue
    it.part.text = it.part.text.replace(BOX, '').replace(BLANK, ' ')
  }
  const kept = items.filter((i) => !isText(i.part) || i.part.text.trim())
  fields.forEach((field, i) => {
    const b = spots[i]
    kept.push({
      part: { field, w: round((b.x1 - b.x0) / body), h: round((b.y1 - b.y0) / body) },
      x: b.x0,
      w: b.x1 - b.x0,
      base: b.y1,
      top: b.y0,
      pt: body,
    })
  })
  if (read && page.source)
    for (const im of read.images) {
      if (hidden(im.x + im.w / 2, im.y + im.h / 2)) continue
      const image = {
        source: page.source,
        x: im.x / read.width,
        y: im.y / read.height,
        width: im.w / read.width,
        height: im.h / read.height,
      }
      kept.push({ part: { image, w: round(im.w / body), h: round(im.h / body) }, x: im.x, w: im.w, base: im.y + im.h, top: im.y, pt: body })
    }

  // Each item goes to the smallest box around its middle, else to the page's free text.
  const boxes = read?.boxes ?? []
  const inBox = new Map<Box, Item[]>()
  const free: Item[] = []
  for (const it of kept) {
    const [x, y] = [it.x + it.w / 2, (it.top + it.base) / 2]
    let best: Box | undefined
    for (const b of boxes) if (within(b, x, y) && (!best || area(b) < area(best))) best = b
    if (best) inBox.set(best, [...(inBox.get(best) ?? []), it])
    else free.push(it)
  }
  for (const list of [...inBox.values(), free])
    if (!list.some((i) => isText(i.part)))
      for (const i of list) if ('field' in i.part) i.part = { ...i.part, caption: true }

  type Placed = FlowBlock & { top: number; bot: number }
  const blocks: Placed[] = []
  // The page's content, its tables and text together: what's laid out by position lines up across both.
  const left = Math.min(...boxes.map((b) => b.x0), ...free.map((i) => i.x))
  const span = Math.max(...boxes.map((b) => b.x1), ...free.map((i) => i.x + i.w)) - left || 1
  // Free text: paragraphs. A line with fields or with several things side by side, or indented, is laid out as on
  // the page (on a page with text: a column header can name its fields).
  const pieces = piecesOf(free)
  const paras = paragraphs(pieces, Math.min(...pieces.map((p) => p.x)), Math.max(...pieces.map((p) => p.end)), body)
  const written = free.some((i) => isText(i.part))
  for (let i = 0; i < paras.length; ) {
    let j = i + 1
    while (j < paras.length && Math.abs(paras[j].base - paras[i].base) < 0.4 * paras[i].pt) j++
    const row = paras.slice(i, j)
    i = j
    const fields = row.some((r) => r.ps.some((p) => p.parts.some((x) => 'field' in x.part)))
    const indent = !row[0].para.align && Math.min(...row[0].ps.map((p) => p.x)) - left > 2 * body
    blocks.push({
      page: page.page,
      y: 0,
      bottom: 0,
      top: Math.min(...row.map((r) => r.top)),
      bot: Math.max(...row.map((r) => r.bottom)),
      ...(written && (row.length > 1 || fields || indent)
        ? { line: true, cells: lineCells(row, left, span, body) }
        : { paras: row.map((r) => r.para) }),
    })
  }
  // Table rows: boxes starting at one height, left to right, as wide as on the page.
  if (boxes.length) {
    const byTop = [...boxes].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    for (let i = 0; i < byTop.length; ) {
      let j = i + 1
      while (j < byTop.length && byTop[j].y0 - byTop[i].y0 <= 2) j++
      const row = byTop.slice(i, j).sort((a, b) => a.x0 - b.x0)
      i = j
      let end = left
      const cells = row.map((b) => {
        const cell: FlowCell = {
          width: round((100 * (b.x1 - b.x0)) / span),
          offset: round((100 * Math.max(0, b.x0 - end)) / span),
          paras: paragraphs(piecesOf(inBox.get(b) ?? []), b.x0 + 1.5, b.x1 - 1.5, body, b.fill).map((p) => p.para),
        }
        if (b.fill) cell.fill = b.fill
        end = Math.max(end, b.x1)
        return cell
      })
      blocks.push({ page: page.page, y: 0, bottom: 0, top: row[0].y0, bot: Math.max(...row.map((b) => b.y1)), cells })
    }
  }
  blocks.sort((a, b) => a.top - b.top)
  return blocks.map(({ top, bot, ...b }, i) => ({
    ...b,
    y: round4(top / H),
    bottom: round4(bot / H),
    ...(i > 0 && top - blocks[i - 1].bot > 0.6 * body && { gap: true }),
  }))
}
