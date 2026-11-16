// Ruled tables: the cells that a page's solid lines close on every side.

import type { Seg } from './shapes'

const cluster = (values: number[], tol: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) if (!out.length || v - out[out.length - 1] > tol) out.push(v)
  return out
}

/**
 * Collinear pieces of one border joined into one line. Word draws a table's borders cell by cell and leaves
 * gaps of 2–3 pt where rows meet, so a column wall would otherwise never cover a whole row.
 */
function joinSegs(lines: Seg[], vertical: boolean): Seg[] {
  const at = (l: Seg) => (vertical ? l.x0 : l.y0)
  const from = (l: Seg) => (vertical ? l.y0 : l.x0)
  const to = (l: Seg) => (vertical ? l.y1 : l.x1)
  const sorted = [...lines].sort((a, b) => at(a) - at(b) || from(a) - from(b))
  const out: Seg[] = []
  for (const l of sorted) {
    const last = out.find((o) => Math.abs(at(o) - at(l)) < 1 && from(l) <= to(o) + 3 && to(l) >= from(o))
    if (!last) out.push({ ...l })
    else if (vertical) last.y1 = Math.max(last.y1, l.y1)
    else last.x1 = Math.max(last.x1, l.x1)
  }
  return out
}

/** Cells of ruled tables: regions between solid lines that are closed on every side. */
export function tableCells(h: Seg[], v: Seg[], lastTextY = Infinity) {
  const TOL = 2
  const vs = joinSegs(
    v.filter((l) => !l.dashed && l.y1 - l.y0 > 8),
    true,
  )
  // A dotted line is an answer line, except where the table's walls end on it with nothing written below: the
  // open edge of a table that goes on to the next page.
  // (Walls that also start on it make it a dotted border between rows, which stays an answer line.)
  const across = (w: Seg, l: Seg) => w.x0 > l.x0 - TOL && w.x0 < l.x1 + TOL
  const edge = (l: Seg) =>
    l.y0 > lastTextY &&
    vs.filter((w) => across(w, l) && Math.abs(w.y1 - l.y0) < 1.5).length >= 2 &&
    !vs.some((w) => across(w, l) && Math.abs(w.y0 - l.y0) < 3)
  const hs = joinSegs(
    h.filter((l) => (!l.dashed || edge(l)) && l.x1 - l.x0 > 8),
    false,
  )
  if (hs.length < 2 || vs.length < 2) return []
  const xs = cluster(
    vs.map((l) => l.x0),
    TOL,
  )
  const ys = cluster(
    hs.map((l) => l.y0),
    TOL,
  )
  if (xs.length < 2 || ys.length < 2 || xs.length * ys.length > 20000) return []
  const covered = (lines: Seg[], at: number, from: number, to: number, horizontal: boolean) =>
    lines.some((l) =>
      horizontal
        ? Math.abs(l.y0 - at) <= TOL && l.x0 <= from + TOL && l.x1 >= to - TOL
        : Math.abs(l.x0 - at) <= TOL && l.y0 <= from + TOL && l.y1 >= to - TOL,
    )
  const C = xs.length - 1
  const R = ys.length - 1
  // Walls between neighbouring grid cells; union cells with no wall between them.
  const parent = Array.from({ length: C * R }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const id = (c: number, r: number) => r * C + c
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (c + 1 < C && !covered(vs, xs[c + 1], ys[r], ys[r + 1], false)) parent[find(id(c, r))] = find(id(c + 1, r))
      if (r + 1 < R && !covered(hs, ys[r + 1], xs[c], xs[c + 1], true)) parent[find(id(c, r))] = find(id(c, r + 1))
    }
  const groups = new Map<number, { c0: number; c1: number; r0: number; r1: number; n: number }>()
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const g = groups.get(find(id(c, r)))
      if (!g) groups.set(find(id(c, r)), { c0: c, c1: c, r0: r, r1: r, n: 1 })
      else
        Object.assign(g, {
          c0: Math.min(g.c0, c),
          c1: Math.max(g.c1, c),
          r0: Math.min(g.r0, r),
          r1: Math.max(g.r1, r),
          n: g.n + 1,
        })
    }
  const cells: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const g of groups.values()) {
    if (g.n !== (g.c1 - g.c0 + 1) * (g.r1 - g.r0 + 1)) continue // not a rectangle
    const x0 = xs[g.c0]
    const x1 = xs[g.c1 + 1]
    const y0 = ys[g.r0]
    const y1 = ys[g.r1 + 1]
    // Closed on all four sides, or it is the space around / between tables.
    if (
      covered(hs, y0, x0, x1, true) &&
      covered(hs, y1, x0, x1, true) &&
      covered(vs, x0, y0, y1, false) &&
      covered(vs, x1, y0, y1, false)
    )
      cells.push({ x0, y0, x1, y1 })
  }
  return cells
}
