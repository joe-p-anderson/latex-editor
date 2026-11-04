// The inks derived from a palette's text, page and detail colours, each held
// to its contrast target (./contrast.ts): the lighter secondary inks, and
// Source view's syntax inks steered apart in hue.
import { AIM, atLeast, deltaE, hex, mix, rgb } from './contrast'

/**
 * The two lighter inks, faded from the text towards the page: `muted` for
 * secondary text (labels, the inactive tabs, panel text), `faint` for
 * comments and line numbers. Each fades as far as its usual mix unless that
 * would drop it below its target on a ground it's drawn on: faint must stay
 * readable as text (comments), and muted keeps a step above it, so comments
 * still read as the quieter of the two.
 */
export function secondaryInks(text: string, page: string, usual: { muted: number; faint: number }, mutedOn: string[], faintOn: string[], min: number) {
  return {
    muted: atLeast(mix(text, page, usual.muted), text, min + MUTED_STEP, [page, ...mutedOn]),
    faint: atLeast(mix(text, page, usual.faint), text, min, [page, ...faintOn]),
  }
}
/** How far muted text stays above faint, in contrast ratio. */
export const MUTED_STEP = 1

/** A colour's hue (degrees), saturation and lightness (0–1). */
function hsl(c: string): [number, number, number] {
  const [r, g, b] = rgb(c).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  return hex([0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))))
}
/**
 * A palette's body hue: the average hue of its marbling, weighted by how
 * saturated each colour is (a near-grey says little about the hue).
 */
export function bodyHue(colours: string[]): number {
  let x = 0
  let y = 0
  for (const c of colours) {
    const [h, s] = hsl(c)
    x += s * Math.cos((h * Math.PI) / 180)
    y += s * Math.sin((h * Math.PI) / 180)
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
/**
 * How different (ΔE) each syntax role stays from the others: a margin over
 * the 20 that tests/contrast.test.ts holds them to.
 */
const ROLE_DISTINCT = 24
/**
 * The structure and maths inks for Source view (.scratch/ux-fixes/spec.md,
 * "Syntax roles"). Commands are in the detail. Maths takes the palette's body
 * hue (`body`), and structure a neighbouring hue on the side away from the
 * commands, so both change with the palette. Each is darkened (paper) or
 * lightened (black) towards the ink as far as it needs to read on `on`, and
 * turned in hue only as far as it must to look clearly different from the
 * roles before it.
 */
export function syntaxInks(detail: string, ink: string, black: boolean, on: string[], body: number) {
  const [s, l] = black ? [0.5, 0.74] : [0.55, 0.32]
  const min = black ? AIM.text : AIM.paperText
  const inkAt = (h: number) => atLeast(fromHsl(((h % 360) + 360) % 360, s, l), ink, min, on)
  /** The hue nearest `want` whose ink is clear of `clearOf`, trying the `first` direction (+1 or −1) first at each step. */
  const nearest = (want: number, clearOf: string[], first: 1 | -1 = 1) => {
    for (let d = 0; d <= 180; d += 5)
      for (const h of [want + first * d, want - first * d]) {
        const c = inkAt(h)
        if (clearOf.every((o) => deltaE(c, o) >= ROLE_DISTINCT)) return { h, c }
      }
    return { h: want, c: inkAt(want) }
  }
  const math = nearest(body, [detail])
  // Which way round the hue circle the commands sit from maths; structure goes the other way.
  const towardCommands = ((hsl(detail)[0] - math.h + 540) % 360) - 180
  const structure = nearest(math.h, [detail, math.c], towardCommands > 0 ? -1 : 1)
  return { math: math.c, structure: structure.c }
}
