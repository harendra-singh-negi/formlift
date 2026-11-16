// The two small learners that pattern learning uses, with no dependencies and no AI service:
//   - logistic regression: how likely a box is a field, from its cues, starting from what auto-detect's rules say
//     (their confidence, as an offset) and corrected by what admins kept and deleted;
//   - counts per cue and class (naive Bayes): the type, settings and grouping admins gave boxes with a cue.
// Both are trained in the browser from the lessons, in a few milliseconds, and give the same result every time.

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
export const logit = (p: number) => {
  const q = Math.min(0.999, Math.max(0.001, p))
  return Math.log(q / (1 - q))
}

/** One training example: its cues (indexes), its outcome, where the rules put it (logit) and its weight. */
export interface Sample {
  x: number[]
  y: 0 | 1
  offset: number
  weight: number
}

/** A trained logistic regression over cue indexes. */
export interface Logistic {
  w: Float64Array
  b: number
}

// Each cue of a box counts 1/√(its cues): a box with many cues that always come together is not more certain.
const scale = (x: number[]) => (x.length ? 1 / Math.sqrt(x.length) : 0)

/** The logit of a box with cues `x` (indexes; unknown ones are left out) and the rules' `offset`. */
export function score(m: Logistic, x: number[], offset: number) {
  const s = scale(x)
  let z = offset + m.b
  for (const j of x) if (j < m.w.length) z += m.w[j] * s
  return z
}

/**
 * Logistic regression with an L2 prior, fitted by AdaGrad over all samples at once. `l2` is how many samples it
 * takes to move a weight: one consistent example moves a box's logit by about 1/l2, so a box the rules do not
 * suggest needs a few before it is suggested.
 */
export function fit(samples: Sample[], dims: number, { l2 = 1, steps = 200, rate = 0.5 } = {}): Logistic {
  const w = new Float64Array(dims)
  const gw = new Float64Array(dims)
  const sum = new Float64Array(dims) // AdaGrad: squared gradients so far
  let b = 0
  let sumB = 0
  for (let step = 0; step < steps; step++) {
    let moved = 0
    gw.fill(0)
    let gb = 0
    for (const s of samples) {
      const err = (sigmoid(score({ w, b }, s.x, s.offset)) - s.y) * s.weight
      const k = scale(s.x)
      for (const j of s.x) gw[j] += err * k
      gb += err
    }
    for (let j = 0; j < dims; j++) {
      const g = gw[j] + l2 * w[j]
      if (!g) continue
      sum[j] += g * g
      const d = (rate * g) / Math.sqrt(sum[j])
      w[j] -= d
      moved = Math.max(moved, Math.abs(d))
    }
    const g = gb + l2 * b
    if (g) {
      sumB += g * g
      b -= (rate * g) / Math.sqrt(sumB)
    }
    // Settled: no weight moves by more than this any more.
    if (moved < 1e-3) break
  }
  return { w, b }
}

/** How often each cue came with each class (weighted), for naive Bayes evidence between two classes. */
export class Counts<C extends string> {
  readonly byCue = new Map<string, Map<C, number>>()
  readonly total = new Map<C, number>()

  add(cues: Iterable<string>, cls: C, weight = 1) {
    this.total.set(cls, (this.total.get(cls) ?? 0) + weight)
    for (const c of cues) {
      let m = this.byCue.get(c)
      if (!m) this.byCue.set(c, (m = new Map()))
      m.set(cls, (m.get(cls) ?? 0) + weight)
    }
  }

  /**
   * The log odds of class `a` over `b` from the cues `cues` (`prior`: and from how often each class came), with the
   * cues that told them apart: those seen `min` times or more with `a`. Cues seen with neither are left out.
   */
  evidence(cues: Iterable<string>, a: C, b: C, { prior = false, min = 2, alpha = 0.5 } = {}) {
    let odds = prior ? Math.log(((this.total.get(a) ?? 0) + alpha) / ((this.total.get(b) ?? 0) + alpha)) : 0
    const telling: string[] = []
    for (const c of cues) {
      const m = this.byCue.get(c)
      const [na, nb] = [m?.get(a) ?? 0, m?.get(b) ?? 0]
      if (na + nb < min) continue
      const r = Math.log((na + alpha) / (nb + alpha))
      odds += r
      if (na >= min && r > 0) telling.push(c)
    }
    return { odds, telling }
  }

  /** The classes seen with a cue, most first. */
  classes(): C[] {
    return [...this.total.keys()].sort((p, q) => this.total.get(q)! - this.total.get(p)!)
  }
}
