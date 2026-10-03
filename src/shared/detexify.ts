// Handwritten symbol recognition: a port of Detexify's legacy classifier
// (Detexify Next by Daniel Kirsch, MIT licence; see
// src/plugins/symbols/ui/assets/NOTICE.md).
//
// A drawing is cleaned up the way Detexify's training samples were (first
// 10 strokes; each smoothed, fitted into the unit square keeping its aspect
// ratio, resampled to 10 points, reduced to its dominant turning points),
// its strokes are joined into one point sequence, and it is compared with
// every sample by greedy dynamic time warping under the Manhattan distance.
// A symbol's score is the mean of its two closest samples; lower is better.

export interface Point {
  x: number
  y: number
}
export type Stroke = Point[]

/** Samples as stored in samples.json.gz: symbol id → samples → strokes → [x0, y0, x1, y1, …] in thousandths. */
export type SampleData = Record<string, number[][][]>

export interface Match {
  id: string
  score: number
}

const DOMINANT_ANGLE = (2 * Math.PI * 15) / 360
const EPSILON = 1e-10

// --- Preprocessing ----------------------------------------------------------

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function unduplicate(s: Stroke): Stroke {
  if (s.length < 2) return [...s]
  const out = [s[0]]
  for (const p of s.slice(1)) if (dist(p, out[out.length - 1]) >= EPSILON) out.push(p)
  return out
}

function smooth(s: Stroke): Stroke {
  if (s.length < 3) return [...s]
  const out = [s[0]]
  for (let i = 0; i + 2 < s.length; i++) out.push({ x: (s[i].x + s[i + 1].x + s[i + 2].x) / 3, y: (s[i].y + s[i + 1].y + s[i + 2].y) / 3 })
  out.push(s[s.length - 1])
  return out
}

/** Fits the stroke into the unit square, keeping its aspect ratio and centring it. */
function aspectRefit(s: Stroke): Stroke {
  if (!s.length) return []
  const xs = s.map((p) => p.x)
  const ys = s.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const w = maxX - minX
  const h = maxY - minY
  if (w === 0 && h === 0) return s.map(() => ({ x: 0.5, y: 0.5 }))
  // Where the stroke's box lands in the unit square (aspect kept, centred).
  const f = w > h ? 1 / w : 1 / h
  const tw = w * f
  const th = h * f
  const [tx, ty] = [(1 - tw) / 2, (1 - th) / 2]
  // Then refit into that box; a flat side is centred in it.
  return s.map((p) => ({
    x: w === 0 ? tx + 0.5 * tw : (p.x - minX) * (tw / w) + tx,
    y: h === 0 ? ty + 0.5 * th : (p.y - minY) * (th / h) + ty,
  }))
}

function length(s: Stroke): number {
  let total = 0
  for (let i = 1; i < s.length; i++) total += dist(s[i], s[i - 1])
  return total
}

/** `count` points evenly spaced along the stroke. */
function redistribute(count: number, s: Stroke): Stroke {
  if (s.length < 2) return [...s]
  const step = length(s) / (count - 1)
  if (step <= 0) return [s[0]]
  const out = [s[0]]
  let left = step
  let current = s[0]
  let i = 1
  while (i < s.length) {
    const next = s[i]
    const seg = dist(current, next)
    if (seg < left) {
      current = next
      i++
      left -= seg
    } else {
      const t = left / seg
      current = { x: current.x + t * (next.x - current.x), y: current.y + t * (next.y - current.y) }
      out.push(current)
      left = step
    }
  }
  const last = s[s.length - 1]
  const end = out[out.length - 1]
  if (end.x !== last.x || end.y !== last.y) out.push(last)
  return out
}

function turn(a: Point, b: Point, c: Point): number {
  const v = { x: b.x - a.x, y: b.y - a.y }
  const w = { x: c.x - b.x, y: c.y - b.y }
  const d = Math.hypot(v.x, v.y) * Math.hypot(w.x, w.y)
  if (d === 0) return 0
  return Math.acos(Math.max(-1, Math.min(1, (v.x * w.x + v.y * w.y) / d)))
}

/** Keeps the points where the stroke turns by at least `angle`. */
function dominant(angle: number, s: Stroke): Stroke {
  if (s.length < 3) return [...s]
  const out = [s[0]]
  let current = s[0]
  let middle = s[1]
  for (let i = 2; i < s.length; i++) {
    if (turn(current, middle, s[i]) >= angle) {
      out.push(middle)
      current = middle
    }
    middle = s[i]
  }
  out.push(middle)
  return out
}

/** A drawing as Detexify compares it: its strokes cleaned up and joined. */
export function preprocess(strokes: Stroke[]): Point[] {
  return strokes
    .filter((s) => s.length > 0)
    .slice(0, 10)
    .flatMap((s) => dominant(DOMINANT_ANGLE, unduplicate(redistribute(10, aspectRefit(smooth(unduplicate(s)))))))
}

// --- Comparison ---------------------------------------------------------------

/**
 * Greedy dynamic time warping over two point sequences (flat [x0, y0, …]
 * arrays), with the Manhattan distance, divided by the path length. Greedy,
 * like Detexify's: each step takes the cheapest of the three moves.
 */
export function greedyDtw(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = a
  let o = b
  const n = () => s.length / 2
  const m = () => o.length / 2
  const d = (i: number, j: number) => Math.abs(s[2 * i] - o[2 * j]) + Math.abs(s[2 * i + 1] - o[2 * j + 1])
  let i = 0
  let j = 0
  let total = d(0, 0)
  let steps = 1
  while (n() - i > 1 && m() - j > 1) {
    const left = d(i + 1, j)
    const middle = d(i + 1, j + 1)
    const right = d(i, j + 1)
    const min = Math.min(left, middle, right)
    if (left === min) {
      i++
      total += left
    } else if (middle === min) {
      i++
      j++
      total += middle
    } else {
      j++
      total += right
    }
    steps++
  }
  // One sequence is used up: walk the rest of the other against its last point.
  if (m() - j === 1) {
    ;[s, o] = [o, s]
    ;[i, j] = [j, i]
  }
  for (let k = j + 1; k < m(); k++) {
    total += d(i, k)
    steps++
  }
  return total / steps
}

export class Classifier {
  private readonly symbols: { id: string; samples: Float64Array[] }[]

  constructor(data: SampleData) {
    this.symbols = Object.entries(data).map(([id, samples]) => ({
      id,
      samples: samples.map((strokes) => Float64Array.from(strokes.flat(), (v) => v / 1000)).filter((s) => s.length > 0),
    }))
  }

  get symbolCount(): number {
    return this.symbols.length
  }

  /** The best matches for a drawing, best first. */
  classify(strokes: Stroke[], limit = 30): Match[] {
    const points = preprocess(strokes)
    if (!points.length) return []
    const unknown = Float64Array.from(points.flatMap((p) => [p.x, p.y]))
    const out: Match[] = []
    for (const sym of this.symbols) {
      if (!sym.samples.length) continue
      // The mean of the two nearest samples.
      let best = Infinity
      let second = Infinity
      for (const sample of sym.samples) {
        const dd = greedyDtw(unknown, sample)
        if (dd < best) [best, second] = [dd, best]
        else if (dd < second) second = dd
      }
      out.push({ id: sym.id, score: second === Infinity ? best : (best + second) / 2 })
    }
    return out.sort((x, y) => x.score - y.score).slice(0, limit)
  }
}
