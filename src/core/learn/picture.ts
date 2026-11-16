// A page without text of its own (a scan) is known again by where its ink is: a small picture of it.

import type { TextPdf } from './text'

// A page's picture: GRID × GRID cells, at least INK_MIN of them inked. Pictures this alike (Dice) are one page: a
// copy of the same scan is 1, another screen of the same app 0.93.
export const GRID = 32
const INK_MIN = 8
export const SAME_PICTURE = 0.95

// What drawing a page's picture needs: pdf.js's canvasFactory (a canvas in the browser, @napi-rs/canvas in Node).
interface Canvas {
  canvas: unknown
  context: { getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } }
}
interface RenderPage {
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: object): { promise: Promise<unknown> }
}

/**
 * Where a page's ink is: GRID × GRID cells, each 1 when clearly darker than the paper, as hex. For a page with no
 * text of its own (a scan). undefined when it cannot be drawn here, or is (nearly) blank.
 */
export async function inkOf(pdf: TextPdf, source: number): Promise<string | undefined> {
  const maker = (pdf as { canvasFactory?: { create(w: number, h: number): Canvas; destroy?(c: Canvas): void } })
    .canvasFactory
  if (!maker) return
  try {
    const page = (await pdf.getPage(source)) as unknown as RenderPage
    const viewport = page.getViewport({ scale: 64 / page.getViewport({ scale: 1 }).width })
    const [W, H] = [Math.ceil(viewport.width), Math.ceil(viewport.height)]
    const c = maker.create(W, H)
    await page.render({ canvas: c.canvas, canvasContext: c.context, viewport, intent: 'print' }).promise
    const { data } = c.context.getImageData(0, 0, W, H)
    maker.destroy?.(c)
    const sum = new Float64Array(GRID * GRID)
    const count = new Float64Array(GRID * GRID)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = 4 * (y * W + x)
        const cell = Math.floor((y * GRID) / H) * GRID + Math.floor((x * GRID) / W)
        sum[cell] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        count[cell]++
      }
    const grey = Array.from(sum, (s, i) => s / count[i])
    const paper = [...grey].sort((a, b) => a - b)[grey.length >> 1]
    const ink = grey.map((g) => g < paper - Math.max(8, paper * 0.04))
    if (ink.filter(Boolean).length < INK_MIN) return
    let hex = ''
    for (let i = 0; i < ink.length; i += 4)
      hex += ((+ink[i] << 3) | (+ink[i + 1] << 2) | (+ink[i + 2] << 1) | +ink[i + 3]).toString(16)
    return hex
  } catch {
    return
  }
}

/** Two pictures alike (Dice of their inked cells: 1 = the same). */
export function sameInk(a: string, b: string) {
  let both = 0
  let all = 0
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [parseInt(a[i], 16), parseInt(b[i], 16)]
    for (let bit = 1; bit < 16; bit <<= 1) {
      both += 2 * +(!!(x & bit) && !!(y & bit))
      all += +!!(x & bit) + +!!(y & bit)
    }
  }
  return all ? both / all : 0
}
