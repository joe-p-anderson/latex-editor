// Jaffer's mathematical marbling (docs/design/ENDLEAF.md, "Marbling engine").
// Ink drops displace what is already on the bath; tines drag it. Each pixel
// is traced backwards through the operations to find its colour. Ported
// from the mockup's bandsFn, marbleOps and renderMarble.
import type { Marbling } from './appearance'

type RGB = [number, number, number]

/** The colours one sheet is marbled in: a palette mode's marbling and vein. */
export interface MarblePalette {
  marbling: string[]
  vein: string
}

/** Bump when the engine's output changes, so cached sheets are redrawn. */
export const MARBLE_ENGINE_VERSION = 1

export const SHEET_SIZES = {
  /** The endpaper itself. Stone's drops are larger, so it needs fewer pixels. */
  big: (pattern: Marbling): [number, number] => (pattern === 'stone' ? [1500, 1000] : [1800, 1200]),
  small: (): [number, number] => [240, 150],
}

/** mulberry32: a small seeded generator. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hexRGB = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB

/** Stripes of the palette (with the odd thin vein) across the bath, as a colour lookup. */
function bands(dir: 'h' | 'v', minW: number, maxW: number, cols: RGB[], vein: RGB, R: () => number, k: number): (x: number, y: number) => RGB {
  const list: [number, number, RGB][] = []
  let pos = 0
  let last = -1
  while (pos < 700 * k) {
    const isVein = R() < 0.13 && last !== 99
    let ci: number
    do ci = Math.floor(R() * 5)
    while (ci === last)
    const w = isVein ? Math.max(1.2, 1.4 * k) : (minW + R() * (maxW - minW)) * k
    list.push([pos, pos + w, isVein ? vein : cols[ci]])
    last = isVein ? 99 : ci
    pos += w
  }
  const period = pos
  const lut: RGB[] = new Array(Math.ceil(period) + 1)
  let j = 0
  for (let t = 0; t < lut.length; t++) {
    while (j < list.length - 1 && list[j][1] <= t) j++
    lut[t] = list[j][2]
  }
  return (x, y) => {
    const t = dir === 'h' ? y : x
    return lut[(((t % period) + period) % period) | 0]
  }
}

type Op =
  /** an ink drop (with a vein-coloured ring when dropped twice) */
  | { t: 0; x: number; y: number; r2: number; c: RGB }
  /** a straight or periodic comb */
  | { t: 1; ax: number; ay: number; nx: number; ny: number; mx: number; my: number; s: number; a: number; l: number }
  /** a sine shift */
  | { t: 2; axis: 0 | 1; A: number; f: number; ph: number; mf: number }
  /** a vortex */
  | { t: 3; x: number; y: number; a: number; l: number }
  /** the fan remap: rows of overlapping scallops outlined in the vein */
  | { t: 4; Rf: number; Hf: number; Wf: number; span: number; edge: number; vein: RGB }

/** The operations that make `pattern`, and the bath's colour before them. Every size scales with k = width / 960. */
function marbleOps(pattern: Marbling, pal: MarblePalette, W: number, H: number, seed: number): { ops: Op[]; base: (x: number, y: number) => RGB } {
  const R = rng(seed * 131 + 7)
  const k = W / 960
  const cols = pal.marbling.map(hexRGB)
  const vein = hexRGB(pal.vein)
  const ops: Op[] = []
  let base = (_x: number, _y: number): RGB => cols[0]
  const drop = (x: number, y: number, r: number, c: RGB) => ops.push({ t: 0, x, y, r2: r * r, c })
  const ring = (x: number, y: number, r: number, c: RGB) => {
    drop(x, y, r, vein)
    drop(x, y, r * 0.9, c)
  }
  const comb = (nx: number, ny: number, mx: number, my: number, s: number, a: number, l: number, off = 0) =>
    ops.push({ t: 1, ax: nx * off, ay: ny * off, nx, ny, mx, my, s: s * k, a: a * k, l: l * k })
  // A back-and-forth comb, then a fine one across it.
  const gelgit = (s: number, a: number, l: number) => {
    comb(1, 0, 0, 1, s, a, l, 0)
    comb(1, 0, 0, -1, s, a, l, (s * k) / 2)
  }
  const nonpareil = (s: number, a: number, l: number) => comb(0, 1, 1, 0, s, a, l)

  if (pattern === 'stone' || pattern === 'spanish') {
    const sites = pattern === 'stone' ? 170 : 90
    for (let i = 0; i < sites; i++) {
      const r = (pattern === 'stone' ? 14 + R() * R() * 58 : 26 + R() * 70) * k
      const c = cols[1 + Math.floor(R() * 4)]
      const x = R() * W
      const y = R() * H
      ring(x, y, r, c)
      if (R() < 0.22) drop(x + (R() - 0.5) * r * 0.3, y + (R() - 0.5) * r * 0.3, r * 0.45, cols[Math.floor(R() * 5)])
    }
    if (pattern === 'spanish') {
      ops.push({ t: 2, axis: 0, A: 20 * k, f: (2 * Math.PI) / (300 * k), ph: R() * 6, mf: 0 })
      ops.push({ t: 2, axis: 0, A: 3.4 * k, f: (2 * Math.PI) / (9 * k), ph: 0, mf: (2 * Math.PI) / (95 * k) })
    }
  } else {
    if (pattern === 'fan') base = bands('v', 2.4, 6.5, cols, vein, R, k)
    else base = bands('h', pattern === 'combed' ? 5 : 3, pattern === 'combed' ? 15 : 8, cols, vein, R, k)
    if (pattern === 'combed') {
      gelgit(64, 72, 12)
      nonpareil(12, 30, 2.4)
    } else if (pattern === 'fan') {
      nonpareil(13, 6, 3)
      ops.push({ t: 4, Rf: 76 * k, Hf: 44 * k, Wf: 138 * k, span: 190 * k, edge: 1.3 * k, vein })
    } else {
      gelgit(32, 40, 8)
      nonpareil(6.5, 12, 1.5)
    }
    if (pattern === 'bouquet') {
      const s = 108 * k
      let sign = 1
      for (let y = s / 2; y < H + s; y += s * 0.86) {
        for (let x = (Math.round(y / s) % 2) * (s / 2); x < W + s; x += s) {
          ops.push({ t: 3, x, y, a: 2.6 * sign, l: 24 * k })
          sign = -sign
        }
      }
    }
    if (pattern === 'peacock') ops.push({ t: 2, axis: 1, A: 15 * k, f: (2 * Math.PI) / (44 * k), ph: 0, mf: 0 })
  }
  return { ops, base }
}

// 2×2 supersampling: the sample grid is twice as fine and averaged, which smooths the hard ink edges.
const OFFSETS = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
]

/** Renders a W×H sheet as RGBA pixels, with ±3 of grain. */
export function renderMarble(pal: MarblePalette, pattern: Marbling, W: number, H: number, seed: number): Uint8ClampedArray {
  const { ops, base } = marbleOps(pattern, pal, W, H, seed)
  const n = ops.length
  const out = new Uint8ClampedArray(W * H * 4)
  const R = rng(seed)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (const [ox, oy] of OFFSETS) {
        let px = x + ox
        let py = y + oy
        let col: RGB | null = null
        for (let i = n - 1; i >= 0; i--) {
          const o = ops[i]
          if (o.t === 0) {
            const dx = px - o.x
            const dy = py - o.y
            const d2 = dx * dx + dy * dy
            if (d2 < o.r2) {
              col = o.c
              break
            }
            const f = Math.sqrt(1 - o.r2 / d2)
            px = o.x + dx * f
            py = o.y + dy * f
          } else if (o.t === 1) {
            const t = (px - o.ax) * o.nx + (py - o.ay) * o.ny
            let dd: number
            if (o.s) {
              const m = ((t % o.s) + o.s) % o.s
              dd = Math.min(m, o.s - m)
            } else dd = Math.abs(t)
            const disp = (o.a * o.l) / (dd + o.l)
            px -= o.mx * disp
            py -= o.my * disp
          } else if (o.t === 2) {
            const mod = o.mf ? Math.max(0, Math.sin(o.mf * (o.axis ? px : py))) : 1
            if (o.axis === 0) px -= o.A * mod * Math.sin(o.f * py + o.ph)
            else py -= o.A * mod * Math.sin(o.f * px + o.ph)
          } else if (o.t === 3) {
            const dx = px - o.x
            const dy = py - o.y
            const rr = Math.sqrt(dx * dx + dy * dy)
            if (rr > o.l * 6) continue
            const th = -o.a * Math.exp(-rr / o.l)
            const cs = Math.cos(th)
            const sn = Math.sin(th)
            px = o.x + dx * cs - dy * sn
            py = o.y + dx * sn + dy * cs
          } else {
            const kmax = Math.floor((py + o.Rf) / o.Hf)
            const kmin = Math.ceil(py / o.Hf)
            for (let kk = kmax; kk >= kmin; kk--) {
              const cy = kk * o.Hf
              const off = kk & 1 ? o.Wf / 2 : 0
              const j = Math.round((px - off) / o.Wf)
              const cx = off + j * o.Wf
              const dx = px - cx
              const dy = cy - py
              const r2 = dx * dx + dy * dy
              if (dy >= 0 && r2 < o.Rf * o.Rf) {
                const rr = Math.sqrt(r2)
                if (rr > o.Rf - o.edge) {
                  col = o.vein
                  break
                }
                px = j * 173.3 + kk * 71.7 + (Math.atan2(dy, dx) / Math.PI) * o.span
                py = kk * 37.1 + rr
                break
              }
            }
            if (col) break
          }
        }
        const cc = col ?? base(px, py)
        r += cc[0]
        g += cc[1]
        b += cc[2]
      }
      const i4 = (y * W + x) * 4
      const grain = (R() - 0.5) * 6
      out[i4] = r / 4 + grain
      out[i4 + 1] = g / 4 + grain
      out[i4 + 2] = b / 4 + grain
      out[i4 + 3] = 255
    }
  }
  return out
}
