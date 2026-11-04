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
  { what: 'maths', fg: editorColours.math, bg: ['paper'], min: TEXT },
  { what: 'comments', fg: editorColours.comment, bg: ['paper'], min: TEXT },
  { what: 'comments in a Live source block', fg: editorColours.comment, bg: ['srcbg'], min: TEXT },
  { what: 'LaTeX commands on the cursor line', fg: editorColours.command, bg: ['active-line'], min: TEXT },
  { what: 'maths on the cursor line', fg: editorColours.math, bg: ['active-line'], min: TEXT },
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
