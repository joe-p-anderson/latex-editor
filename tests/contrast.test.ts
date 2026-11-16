// WCAG contrast for every token pair the UI draws, in every palette × page ×
// look (.scratch/ux-fixes/spec.md, "Contrast"). Text needs 4.5:1; line
// numbers, icons and the tab × need 3:1. The colours come from the same
// functions the UI uses: appearanceTokens (which folds in plainTokens and
// Bench's chrome), the editor theme's colour map and the Live theme's.
import { describe, expect, it } from 'vitest'
import themes from '../endleaf-marbled-themes/themes.json'
import {
  activeLine,
  appearanceTokens,
  DEFAULT_APP_APPEARANCE,
  defaultVaultAppearance,
  editorColours,
  liveColours,
  PALETTES,
  type Binding,
  type Look,
  type Page,
  type PaletteTheme,
} from '../src/shared/appearance'

const THEMES = themes.themes as PaletteTheme[]
const TEXT = 4.5
const GRAPHIC = 3
/**
 * The grain on the page and sidebar isn't in the tokens, so text on them
 * keeps a margin when the page is paper (on black the grain barely shows).
 */
const PAPER_MARGIN = 0.3
const GRAINED = ['paper', 'srcbg', 'side', 'active-line']

/** `var(--ink)` → `ink`; a bare token name passes through. */
const token = (css: string) => css.match(/^var\(--([\w-]+)\)$/)?.[1] ?? css

/** A colour as [r, g, b, a] (0–255, alpha 0–1): #RRGGBB or rgba(). */
function parse(c: string): number[] {
  if (c.startsWith('#')) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(1)
  const m = c.match(/^rgba?\(([^)]+)\)$/)
  if (!m) throw new Error(`can't read colour ${c}`)
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return [p[0], p[1], p[2], p[3] ?? 1]
}
const over = (top: number[], bot: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1)
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(fg: string, ...bgs: string[]): number {
  // The backgrounds are listed top first; the last must be opaque.
  const bg = bgs.reduceRight<number[]>((under, c) => over(parse(c), under), [255, 255, 255, 1])
  const a = lum(over(parse(fg), bg))
  const b = lum(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * What the UI draws: a foreground token on a stack of background tokens (top
 * first), and its target. Each entry names the component that draws it.
 */
interface Pair {
  what: string
  fg: string
  bg: string[]
  min: number
  /** Drawn at this opacity. */
  alpha?: number
  /** Only in this look (the two looks draw tabs differently). */
  look?: Look
}
const PAIRS: Pair[] = [
  // The editor (editorTheme.ts): source mode on the page, and Live's source block on srcbg.
  { what: 'body text', fg: editorColours.text, bg: ['paper'], min: TEXT },
  { what: 'LaTeX commands', fg: editorColours.command, bg: ['paper'], min: TEXT },
  { what: 'LaTeX commands in a Live source block', fg: editorColours.command, bg: ['srcbg'], min: TEXT },
  { what: 'LaTeX structure (environment names, keys)', fg: editorColours.structure, bg: ['paper'], min: TEXT },
  { what: 'LaTeX structure in a Live source block', fg: editorColours.structure, bg: ['srcbg'], min: TEXT },
  { what: 'maths', fg: editorColours.math, bg: ['paper'], min: TEXT },
  { what: 'maths in a Live source block', fg: editorColours.math, bg: ['srcbg'], min: TEXT },
  { what: 'comments', fg: editorColours.comment, bg: ['paper'], min: TEXT },
  { what: 'comments in a Live source block', fg: editorColours.comment, bg: ['srcbg'], min: TEXT },
  { what: 'LaTeX commands on the cursor line', fg: editorColours.command, bg: ['active-line'], min: TEXT },
  { what: 'maths on the cursor line', fg: editorColours.math, bg: ['active-line'], min: TEXT },
  { what: 'LaTeX structure on the cursor line', fg: editorColours.structure, bg: ['active-line'], min: TEXT },
  { what: 'comments on the cursor line', fg: editorColours.comment, bg: ['active-line'], min: TEXT },
  { what: 'braces', fg: editorColours.bracket, bg: ['paper'], min: TEXT },
  { what: 'line numbers', fg: editorColours.lineNumber, bg: ['paper'], min: GRAPHIC },
  { what: 'active line number', fg: editorColours.activeLineNumber, bg: ['paper'], min: GRAPHIC },
  // Live view (live/theme.ts).
  { what: 'Live secondary text', fg: liveColours.muted, bg: ['paper'], min: TEXT },
  { what: 'Live accent text', fg: liveColours.accent, bg: ['paper'], min: TEXT },
  // Title bar, activity bar and status bar (TitleBar, ActivityBar, StatusBar).
  { what: 'title & status text', fg: 'chrome-ink', bg: ['chrome'], min: TEXT },
  { what: 'secondary title & status text', fg: 'chrome-ink-soft', bg: ['chrome'], min: TEXT },
  { what: 'inactive Live/Source', fg: 'chrome-ink-soft', bg: ['chrome-btn', 'chrome'], min: TEXT },
  { what: 'active Live/Source', fg: 'chrome-active', bg: ['chrome-btn', 'chrome'], min: TEXT },
  { what: 'activity bar icons', fg: 'chrome-ink-soft', bg: ['chrome'], min: GRAPHIC },
  // Sidebar (App.svelte, FileTree, Outline).
  { what: 'sidebar text', fg: 'ink', bg: ['side'], min: TEXT },
  { what: 'sidebar labels', fg: 'ink-soft', bg: ['side'], min: TEXT },
  { what: 'sidebar accents', fg: 'detail', bg: ['side'], min: TEXT },
  // Tabs: Plain's tab bar (TabBar), Bench's index tabs (IndexTabs, whose × shows at 0.7 on hover).
  { what: 'tab names', fg: 'ink-soft', bg: ['tabpaper'], min: TEXT, look: 'plain' },
  { what: 'active tab name', fg: 'ink', bg: ['desk'], min: TEXT, look: 'plain' },
  { what: 'tab ×', fg: 'ink-soft', bg: ['tabpaper'], min: GRAPHIC, look: 'plain' },
  { what: "a paper's § on its tab", fg: 'detail', bg: ['tabpaper'], min: TEXT, look: 'plain' },
  { what: "a paper's § on the active tab", fg: 'detail', bg: ['desk'], min: TEXT, look: 'plain' },
  { what: 'tab names', fg: 'ink', bg: ['tabpaper'], min: TEXT, look: 'bench' },
  { what: 'active tab name', fg: 'ink', bg: ['paper'], min: TEXT, look: 'bench' },
  { what: 'tab ×', fg: 'ink', alpha: 0.7, bg: ['tabpaper'], min: GRAPHIC, look: 'bench' },
  // The Problems panel (ProblemsPanel).
  { what: 'panel tabs', fg: 'ink-soft', bg: ['side'], min: TEXT },
  { what: 'panel text', fg: 'ink-soft', bg: ['paper'], min: TEXT },
  { what: 'count badge', fg: 'ink', bg: ['line'], min: TEXT },
  { what: 'error count badge', fg: 'paper', bg: ['err'], min: TEXT },
  { what: 'warning count badge', fg: 'paper', bg: ['warn'], min: TEXT },
]

const CONFIGS = PALETTES.flatMap((palette) =>
  (['paper', 'black'] as Page[]).flatMap((page) =>
    (['plain', 'bench'] as Look[]).map((look) => ({ palette, page, look, binding: DEFAULT_APP_APPEARANCE.binding })),
  ),
)
/** Bench on a paper page can also be bound in linen (black pages force dark leather). */
const LINEN = PALETTES.map((palette) => ({ palette, page: 'paper' as Page, look: 'bench' as Look, binding: 'linen' as Binding }))

describe('contrast', () => {
  it('covers every palette, page and look', () => {
    expect(CONFIGS).toHaveLength(24)
  })

  it.each([...CONFIGS, ...LINEN])('$palette on $page, $look ($binding): every pair meets its target', ({ palette, page, look, binding }) => {
    const theme = THEMES.find((t) => t.id === palette)!
    const t = appearanceTokens({ ...DEFAULT_APP_APPEARANCE, look, page, binding }, { ...defaultVaultAppearance('x'), palette }, theme)
    // The cursor's line isn't a token: editorTheme.ts tints the page with ink.
    t['active-line'] = activeLine(t.paper, t.ink)
    const value = (name: string) => {
      const v = t[token(name)]
      if (!v) throw new Error(`no token ${name}`)
      return v
    }
    const failures: string[] = []
    for (const p of PAIRS.filter((p) => !p.look || p.look === look)) {
      const grained = page === 'paper' && GRAINED.includes(p.bg[p.bg.length - 1])
      const min = p.min + (grained && p.min === TEXT ? PAPER_MARGIN : 0)
      const fg = parse(value(p.fg))
      const r = contrast(`rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, ${fg[3] * (p.alpha ?? 1)})`, ...p.bg.map(value))
      if (r < min) failures.push(`${palette} ${page} ${look}${binding === 'linen' ? ' (linen)' : ''}: ${p.what} (${token(p.fg)} on ${p.bg.join(' over ')}) is ${r.toFixed(2)}:1, needs ${min}:1`)
    }
    expect(failures).toEqual([])
  })
})

/** CIE L*a*b* of an opaque #RRGGBB colour (D65). */
function lab(c: string): number[] {
  const lin = parse(c).slice(0, 3).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const [r, g, b] = lin
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116))
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])]
}
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))
/** How far apart (ΔE*ab) two syntax roles must be to tell apart at a glance. */
const DISTINCT = 20

describe('syntax roles', () => {
  it.each(CONFIGS)('$palette on $page, $look: commands, structure and maths are visibly different colours', ({ palette, page, look, binding }) => {
    const theme = THEMES.find((t) => t.id === palette)!
    const t = appearanceTokens({ ...DEFAULT_APP_APPEARANCE, look, page, binding }, { ...defaultVaultAppearance('x'), palette }, theme)
    const roles = { command: editorColours.command, structure: editorColours.structure, math: editorColours.math }
    const colour = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, t[token(v)]]))
    const close: string[] = []
    const names = Object.keys(roles)
    for (const [i, a] of names.entries())
      for (const b of names.slice(i + 1)) {
        const d = deltaE(colour[a], colour[b])
        if (!(d >= DISTINCT)) close.push(`${a} ${colour[a]} and ${b} ${colour[b]} are ΔE ${d.toFixed(1)}`)
      }
    expect(close).toEqual([])
  })
})

/** A colour's hue in degrees. */
function hue(c: string): number {
  const [r, g, b] = parse(c).slice(0, 3).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}

describe('maths follows the palette', () => {
  const PAGES_LOOKS = (['paper', 'black'] as Page[]).flatMap((page) => (['plain', 'bench'] as Look[]).map((look) => ({ page, look })))
  const tokensFor = (palette: (typeof PALETTES)[number], page: Page, look: Look) => {
    const theme = THEMES.find((t) => t.id === palette)!
    return appearanceTokens({ ...DEFAULT_APP_APPEARANCE, look, page }, { ...defaultVaultAppearance('x'), palette }, theme)
  }
  const mathFor = (palette: (typeof PALETTES)[number], page: Page, look: Look) => tokensFor(palette, page, look)[token(editorColours.math)]

  it.each(PAGES_LOOKS)('on $page, $look: every palette has its own maths colour', ({ page, look }) => {
    const colours = PALETTES.map((p) => mathFor(p, page, look))
    expect(new Set(colours).size).toBe(PALETTES.length)
  })

  it.each(PAGES_LOOKS)('on $page, $look: every palette has its own structure colour', ({ page, look }) => {
    const colours = PALETTES.map((p) => tokensFor(p, page, look)[token(editorColours.structure)])
    expect(new Set(colours).size).toBe(PALETTES.length)
  })

  it.each(PAGES_LOOKS)('on $page, $look: structure is a neighbour of the maths hue', ({ page, look }) => {
    const far: string[] = []
    for (const p of PALETTES) {
      const t = tokensFor(p, page, look)
      const d = Math.abs(hue(t[token(editorColours.structure)]) - hue(t[token(editorColours.math)]))
      if (Math.min(d, 360 - d) > 120) far.push(`${p}: ${Math.min(d, 360 - d).toFixed(0)}°`)
    }
    expect(far).toEqual([])
  })

  it.each(PAGES_LOOKS)('on $page, $look: maths takes the hue of the palette where the commands leave room', ({ page, look }) => {
    // A palette's maths is in its own hue range unless the commands are
    // already in that range (Bench draws commands in the palette's colour).
    const ranges = { 'plum-amber': [280, 345], 'forest-floor': [60, 160], 'oxblood-gilt': [330, 380] } as const
    for (const [palette, [lo, hi]] of Object.entries(ranges) as [keyof typeof ranges, readonly [number, number]][]) {
      const inRange = (h: number) => (h >= lo && h <= hi) || (h + 360 >= lo && h + 360 <= hi)
      if (inRange(hue(tokensFor(palette, page, look).detail))) continue
      const h = hue(mathFor(palette, page, look))
      expect(inRange(h), `${palette} maths hue ${h.toFixed(0)}`).toBe(true)
    }
  })
})
