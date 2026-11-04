// The inks derived from a palette's text, page and detail colours, each held
// to its contrast target (./contrast.ts): the lighter secondary inks, and
// Source view's syntax inks steered apart in hue.
import { AIM, atLeast, hex, mix, rgb } from './contrast'

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
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
/** The hue nearest `want` that sits at least `gap` degrees from every one of `away`. */
function hueAway(want: number, away: number[], gap: number): number {
  for (let d = 0; d <= 180; d += 5)
    for (const h of [want + d, want - d]) {
      const x = (h + 360) % 360
      if (away.every((a) => hueGap(x, a) >= gap)) return x
    }
  return want
}
/** How far apart, in hue, the three syntax roles sit. */
const ROLE_GAP = 75
/**
 * The structure and maths inks for Source view (.scratch/ux-fixes/spec.md,
 * "Syntax roles"). Commands are in the detail; maths prefers a blue and
 * structure a green, each turned as far as it must to keep clear of the
 * detail's hue and of each other. Each is then darkened (paper) or lightened
 * (black) towards the ink as far as it needs to read on `on`.
 */
export function syntaxInks(detail: string, ink: string, black: boolean, on: string[]) {
  const accent = hsl(detail)[0]
  const mathHue = hueAway(220, [accent], ROLE_GAP)
  const structureHue = hueAway(140, [accent, mathHue], ROLE_GAP)
  const [s, l] = black ? [0.5, 0.74] : [0.55, 0.32]
  const min = black ? AIM.text : AIM.paperText
  return {
    math: atLeast(fromHsl(mathHue, s, l), ink, min, on),
    structure: atLeast(fromHsl(structureHue, s, l), ink, min, on),
  }
}
