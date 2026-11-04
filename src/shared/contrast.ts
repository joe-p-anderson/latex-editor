// Colour arithmetic on #RRGGBB strings, and the WCAG contrast maths the
// appearance tokens are derived with (./appearance.ts) and checked by
// (tests/contrast.test.ts).

export const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export const hex = (a: number[]) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
/** `a` moved `t` of the way towards `b`. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a)
  const B = rgb(b)
  return hex(A.map((v, i) => v + (B[i] - v) * t))
}

const luminance = (h: string) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = rgb(h)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** The WCAG contrast ratio of two opaque colours. */
export function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** CIE L*a*b* of a #RRGGBB colour (D65). */
function lab(c: string): number[] {
  const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map((v) =>
    v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116,
  )
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])]
}
/** How different two colours look (ΔE*ab): about 2 is just noticeable, 20 tells apart at a glance. */
export function deltaE(a: string, b: string): number {
  const A = lab(a)
  const B = lab(b)
  return Math.hypot(...A.map((v, i) => v - B[i]))
}

/**
 * Contrast targets (.scratch/ux-fixes/spec.md, "Contrast"): text 4.5:1,
 * line numbers and icons 3:1. Text on a paper page keeps a margin for the
 * grain, which isn't in the tokens.
 */
export const CONTRAST = { text: 4.5, graphic: 3, paperText: 4.8 }
/**
 * What the derivations aim for: a little over the targets, because the
 * browser's color-mix() rounds differently from `mix` (the cursor line
 * measured 4.49:1 when aimed at exactly 4.5).
 */
export const AIM = { text: CONTRAST.text + 0.1, paperText: CONTRAST.paperText + 0.1 }

/**
 * `c` moved towards `toward` just far enough to reach `min`:1 against each of
 * `on`. A colour that already passes is returned as it is, so a derivation's
 * usual mix stands wherever it's readable and is pulled in only where not.
 */
export function atLeast(c: string, toward: string, min: number, on: string[]): string {
  const ok = (x: string) => on.every((b) => contrast(x, b) >= min)
  if (ok(c)) return c
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2
    if (ok(mix(c, toward, t))) hi = t
    else lo = t
  }
  return mix(c, toward, hi)
}
