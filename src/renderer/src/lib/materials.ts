// The Bench look's materials, drawn once per session as small tiles: the
// paper grain, saddle and dark leather, linen buckram, felt and the leather
// desk pad. Ported from the mockup's procedural materials. Each is a few
// tens of milliseconds, so they're made on first use.
import { rng } from '@shared/marbling'

function makeNoise(seed: number): (x: number, y: number, px?: number, py?: number) => number {
  const R = rng(seed)
  const P = new Uint8Array(512)
  const G = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    P[i] = i
    G[i] = R()
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(R() * (i + 1))
    ;[P[i], P[j]] = [P[j], P[i]]
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i]
  // Value noise that tiles with period px × py.
  return (x, y, px = 256, py = 256) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const x0 = ((xi % px) + px) % px
    const x1 = (x0 + 1) % px
    const y0 = ((yi % py) + py) % py
    const y1 = (y0 + 1) % py
    const a = G[P[P[x0] + y0]]
    const b = G[P[P[x1] + y0]]
    const c = G[P[P[x0] + y1]]
    const d = G[P[P[x1] + y1]]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

function fbm(n: ReturnType<typeof makeNoise>, x: number, y: number, octaves: number, p: number): number {
  let s = 0
  let a = 1
  let t = 0
  for (let i = 0; i < octaves; i++) {
    s += a * n(x, y, p, p)
    t += a
    x *= 2
    y *= 2
    p *= 2
    a *= 0.5
  }
  return s / t
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Fills an S×S tile pixel by pixel; `shade(u, v, x, y)` gives a multiplier of `base` (or a grey when base is null). */
function tile(S: number, base: number[] | null, shade: (u: number, v: number, x: number, y: number) => number, type = 'image/jpeg'): string {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(S, S)
  const d = img.data
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = shade(x / S, y / S, x, y)
      const i = (y * S + x) * 4
      if (base) {
        d[i] = clamp8(base[0] * k)
        d[i + 1] = clamp8(base[1] * k)
        d[i + 2] = clamp8(base[2] * k)
      } else d[i] = d[i + 1] = d[i + 2] = clamp8(k)
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  if (!base) {
    // A few fibres in the paper, wrapped so the tile stays seamless.
    const R = rng(4)
    for (let i = 0; i < 40; i++) {
      const x = R() * S
      const y = R() * S
      const alpha = 0.25 + R() * 0.3
      const r = 0.4 + R() * 0.6
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          ctx.fillStyle = `rgba(60,60,60,${alpha})`
          ctx.beginPath()
          ctx.arc(x + ox, y + oy, r, 0, 7)
          ctx.fill()
        }
    }
  }
  return c.toDataURL(type, 0.9)
}

/** A neutral grain, blended soft-light over any paper colour: mid-grey means "no change". */
function grain(): string {
  const n = makeNoise(7)
  const g = makeNoise(21)
  const f = makeNoise(33)
  return tile(
    512,
    null,
    (u, v) => 128 + (fbm(n, u * 4, v * 4, 4, 4) - 0.5) * 26 + (g(u * 128, v * 128, 128, 128) - 0.5) * 16 + (f(u * 96, v * 10, 96, 10) - 0.5) * 8,
    'image/png',
  )
}

function leather(base: number[], seed: number): string {
  const n = makeNoise(seed)
  const n2 = makeNoise(seed + 4)
  const n3 = makeNoise(seed + 12)
  return tile(256, base, (u, v) => {
    const low = fbm(n, u * 4, v * 4, 3, 4) - 0.5
    const pebble = n2(u * 48, v * 48, 48, 48) - 0.5
    const pebble2 = n2(u * 96 + 7, v * 96, 96, 96) - 0.5
    const crease = Math.abs(n3(u * 10, v * 10, 10, 10) - 0.5)
    let k = 0.94 + low * 0.2 + pebble * 0.1 + pebble2 * 0.05
    if (crease < 0.02) k *= 0.9 + crease * 5
    return k
  })
}

function linen(): string {
  const n = makeNoise(41)
  return tile(256, [205, 198, 180], (u, v, x, y) => {
    const weave = ((x >> 1) + (y >> 1)) & 1
    const slub = (n(u * 256, v * 6, 256, 6) - 0.5) * 0.09 + (n(u * 6, v * 256, 6, 256) - 0.5) * 0.09
    return 0.95 + weave * 0.04 + (n(u * 16, v * 16, 16, 16) - 0.5) * 0.06 + slub
  })
}

function felt(base: number[], seed: number): string {
  const n = makeNoise(seed)
  const g = makeNoise(seed + 3)
  const f = makeNoise(seed + 9)
  return tile(
    256,
    base,
    (u, v) => 1 + (fbm(n, u * 6, v * 6, 3, 6) - 0.5) * 0.09 + (g(u * 128, v * 128, 128, 128) - 0.5) * 0.1 + (f(u * 256, v * 256, 256, 256) - 0.5) * 0.06,
  )
}

const MAKERS = {
  grain,
  saddle: () => leather([168, 112, 63], 5),
  leather: () => leather([78, 44, 27], 15),
  linen,
  felt: () => felt([96, 90, 83], 51),
  pad: () => leather([92, 56, 38], 71),
}
export type Material = keyof typeof MAKERS

const made = new Map<Material, string>()

/** The material's tile as a data URL, made the first time it's asked for. */
export function material(m: Material): string {
  let url = made.get(m)
  if (!url) made.set(m, (url = MAKERS[m]()))
  return url
}
