import type { Position } from './form-logic'

// Field positions are fractions (0..1) of their PDF page, measured from the page's top left. The overlay is
// placed with CSS percentages, so zoom, window size and screen never move a field; only these conversions
// touch pixels.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
export const MIN_SIZE = 0.01

/** Snaps a fraction to the grid (`grid` = step as a fraction of the page, 0 = off). */
export const snap = (n: number, grid: number) => (grid > 0 ? Math.round(n / grid) * grid : n)

/** A point on the page element (client pixels) as page fractions. */
export function toPage(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
) {
  return { x: clamp((clientX - rect.left) / rect.width, 0, 1), y: clamp((clientY - rect.top) / rect.height, 0, 1) }
}

/** Keeps a box inside its page and at least MIN_SIZE big. */
export function fitInPage(p: Position): Position {
  const width = clamp(p.width, MIN_SIZE, 1)
  const height = clamp(p.height, MIN_SIZE, 1)
  return { ...p, width, height, x: clamp(p.x, 0, 1 - width), y: clamp(p.y, 0, 1 - height) }
}

/** How much two spans [a0, a1] and [b0, b1] share. */
export const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** Covers more than 30 % of a box already placed (or of itself, the smaller one): the same place. */
export const clashes = (taken: Position[], p: Position) =>
  taken.some(
    (t) =>
      t.page === p.page &&
      overlap(t.x, t.x + t.width, p.x, p.x + p.width) * overlap(t.y, t.y + t.height, p.y, p.y + p.height) >
        0.3 * Math.min(t.width * t.height, p.width * p.height),
  )

/** Moves a box by a fraction delta (dragged), snapped, kept inside the page. */
export function moveBy(p: Position, dx: number, dy: number, grid = 0): Position {
  return fitInPage({ ...p, x: snap(p.x + dx, grid), y: snap(p.y + dy, grid) })
}

/** Resizes from the bottom-right corner by a fraction delta, snapped, kept inside the page. */
export function resizeBy(p: Position, dw: number, dh: number, grid = 0): Position {
  const width = clamp(snap(p.x + p.width + dw, grid) - p.x, MIN_SIZE, 1 - p.x)
  const height = clamp(snap(p.y + p.height + dh, grid) - p.y, MIN_SIZE, 1 - p.y)
  return { ...p, width, height }
}

/** CSS that places a box on its page element. */
export const boxStyle = (p: Position) => ({
  left: `${p.x * 100}%`,
  top: `${p.y * 100}%`,
  width: `${p.width * 100}%`,
  height: `${p.height * 100}%`,
})
