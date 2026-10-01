// The endleaf appearance settings (docs/design/ENDLEAF.md, "Settings") and
// the colour tokens derived from them. Global choices live in settings.json,
// the vault's endpaper in .vault.json; both are read through `normalize…`,
// so a missing or hand-edited value falls back to its default.

export type Look = 'plain' | 'bench'
/** The palette's own paper stock, or the black page (which is the dark mode). */
export type Page = 'paper' | 'black'
export type Desk = 'felt' | 'pad'
export type Binding = 'saddle' | 'linen'
export type TabEdge = 'left' | 'top'
export type Typeface = 'Crimson Pro' | 'Libre Caslon Text' | 'Old Standard TT' | 'EB Garamond'
export type PaletteId = 'autumn-ember' | 'bookbinders-blue' | 'oxblood-gilt' | 'forest-floor' | 'plum-amber' | 'slate-ember'
export type Marbling = 'stone' | 'combed' | 'nonpareil' | 'fan' | 'bouquet' | 'spanish' | 'peacock'
/** Rich uses the palette's `dark` marbling, Pale its `light` one. */
export type Tone = 'rich' | 'pale'

/** Global appearance, in settings.json. */
export interface AppAppearance {
  look: Look
  page: Page
  desk: Desk
  binding: Binding
  tabs: TabEdge
  /** The measure, in characters. */
  lineLength: number
  /** Text size in px. */
  textSize: number
  typeface: Typeface
}

/** A vault's endpaper, in .vault.json. */
export interface VaultAppearance {
  palette: PaletteId
  marbling: Marbling
  tone: Tone
  seed: number
}

export const LOOKS: [Look, string][] = [
  ['plain', 'Plain'],
  ['bench', 'Bench'],
]
export const DESKS: [Desk, string][] = [
  ['felt', 'Felt'],
  ['pad', 'Leather pad'],
]
export const BINDINGS: [Binding, string][] = [
  ['saddle', 'Saddle leather'],
  ['linen', 'Linen'],
]
export const TAB_EDGES: [TabEdge, string][] = [
  ['left', 'Left edge'],
  ['top', 'Top edge'],
]
export const TYPEFACES: Typeface[] = ['Crimson Pro', 'Libre Caslon Text', 'Old Standard TT', 'EB Garamond']
export const TEXT_SIZES = [17, 18, 19, 20, 21]
export const LINE_LENGTH = { min: 60, max: 96 }
export const MARBLINGS: [Marbling, string][] = [
  ['stone', 'Stone'],
  ['combed', 'Bold comb'],
  ['nonpareil', 'Nonpareil'],
  ['fan', 'Fan'],
  ['bouquet', 'Bouquet'],
  ['spanish', 'Spanish'],
  ['peacock', 'Peacock'],
]
export const TONES: [Tone, string][] = [
  ['rich', 'Rich'],
  ['pale', 'Pale'],
]

/** Each palette's paper stock and print accent, chosen like paper for an edition. */
export const STOCK: Record<PaletteId, { name: string; paper: string; ink: string; detail: string; black: string }> = {
  'autumn-ember': { name: 'Cream wove', paper: '#F5EDDD', ink: '#2A2119', detail: '#9A3F22', black: '#1E1915' },
  'bookbinders-blue': { name: 'Bright white', paper: '#FBFAF7', ink: '#1C2230', detail: '#2F4E7E', black: '#141821' },
  'oxblood-gilt': { name: 'Ivory laid', paper: '#F6EFE3', ink: '#281C1B', detail: '#7E2226', black: '#1C1416' },
  'forest-floor': { name: 'Natural', paper: '#F3EFE2', ink: '#212518', detail: '#46602F', black: '#151A15' },
  'plum-amber': { name: 'Soft white', paper: '#F8F4F1', ink: '#261E25', detail: '#6E3160', black: '#1A1420' },
  'slate-ember': { name: 'Cool white', paper: '#F4F4F1', ink: '#212226', detail: '#A24E1E', black: '#17181A' },
}
export const PALETTES = Object.keys(STOCK) as PaletteId[]

export const DEFAULT_APP_APPEARANCE: AppAppearance = {
  look: 'plain',
  page: 'black',
  desk: 'felt',
  binding: 'saddle',
  tabs: 'left',
  lineLength: 82,
  textSize: 19,
  typeface: 'Crimson Pro',
}

/** A vault's default endpaper. The seed is fixed per vault: derived from its name until "Remarble" picks one. */
export function defaultVaultAppearance(vaultName: string): VaultAppearance {
  let h = 2166136261
  for (const c of vaultName) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return { palette: 'bookbinders-blue', marbling: 'combed', tone: 'rich', seed: (h >>> 0) % 100000 }
}

const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)
const ids = <T>(pairs: [T, string][]) => pairs.map(([id]) => id)
const intIn = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback

export function normalizeAppAppearance(raw: unknown): AppAppearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AppAppearance, unknown>>
  const d = DEFAULT_APP_APPEARANCE
  return {
    look: oneOf(r.look, ids(LOOKS), d.look),
    page: oneOf(r.page, ['paper', 'black'] as Page[], d.page),
    desk: oneOf(r.desk, ids(DESKS), d.desk),
    binding: oneOf(r.binding, ids(BINDINGS), d.binding),
    tabs: oneOf(r.tabs, ids(TAB_EDGES), d.tabs),
    lineLength: intIn(r.lineLength, LINE_LENGTH.min, LINE_LENGTH.max, d.lineLength),
    textSize: oneOf(r.textSize, TEXT_SIZES, d.textSize),
    typeface: oneOf(r.typeface, TYPEFACES, d.typeface),
  }
}

export function normalizeVaultAppearance(raw: unknown, vaultName: string): VaultAppearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof VaultAppearance, unknown>>
  const d = defaultVaultAppearance(vaultName)
  return {
    palette: oneOf(r.palette, PALETTES, d.palette),
    marbling: oneOf(r.marbling, ids(MARBLINGS), d.marbling),
    tone: oneOf(r.tone, ids(TONES), d.tone),
    seed: intIn(r.seed, 0, 2 ** 31 - 1, d.seed),
  }
}

// --- Colour -----------------------------------------------------------------

/** One mode of a palette in endleaf-marbled-themes/themes.json. */
export interface PaletteMode {
  marbling: string[]
  vein: string
  label: string
  leafFoil: { offset: number; color: string }[]
}
export interface PaletteTheme {
  id: string
  name: string
  modes: { dark: PaletteMode; light: PaletteMode }
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hex = (a: number[]) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
/** `a` moved `t` of the way towards `b`. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a)
  const B = rgb(b)
  return hex(A.map((v, i) => v + (B[i] - v) * t))
}

export interface PlainTokens {
  bar: string
  chrome: string
  side: string
  desk: string
  page: string
  text: string
  muted: string
  faint: string
  accent: string
  line: string
  sel: string
  srcbg: string
  math: string
}

/** The Plain look's flat palette, from the palette mode matching the page (the mockup's plainTokens). */
export function plainTokens(theme: PaletteTheme, mode: 'light' | 'dark'): PlainTokens {
  const md = theme.modes[mode]
  const m = md.marbling
  const v = md.vein
  const L = md.label
  if (mode === 'dark') {
    const page = mix(m[2], '#ffffff', 0.045)
    const text = mix('#EDE5D8', v, 0.1)
    const side = mix(L, m[2], 0.6)
    return {
      bar: L,
      chrome: mix(L, m[2], 0.35),
      side,
      desk: mix(L, m[0], 0.42),
      page,
      text,
      muted: mix(text, page, 0.38),
      faint: mix(text, page, 0.66),
      accent: v,
      line: mix(side, text, 0.12),
      sel: mix(side, v, 0.2),
      srcbg: mix(page, v, 0.07),
      math: mix(text, m[3], 0.38),
    }
  }
  const page = L
  const text = mix('#211C18', m[5], 0.14)
  const side = mix(m[2], L, 0.4)
  return {
    bar: mix(m[4], m[1], 0.45),
    chrome: mix(m[2], m[0], 0.55),
    side,
    desk: mix(m[0], m[4], 0.5),
    page,
    text,
    muted: mix(text, page, 0.44),
    faint: mix(text, page, 0.68),
    accent: v,
    line: mix(side, text, 0.14),
    sel: mix(side, m[3], 0.22),
    srcbg: mix(page, m[0], 0.45),
    math: mix(m[3], text, 0.35),
  }
}

/** The gilt: the dark foil's stop nearest offset 0.34. */
export function gilt(theme: PaletteTheme): string {
  return theme.modes.dark.leafFoil.reduce((a, s) => (Math.abs(s.offset - 0.34) < Math.abs(a.offset - 0.34) ? s : a)).color
}

/** The full foil, for active-item rules. */
export function foil(theme: PaletteTheme): string {
  return `linear-gradient(115deg, ${theme.modes.dark.leafFoil.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})`
}

/** Stands in for the marbled sheet until it is rendered: a gradient of the palette's colours. */
export function marblePlaceholder(theme: PaletteTheme, tone: Tone): string {
  const m = theme.modes[tone === 'rich' ? 'dark' : 'light'].marbling
  return `linear-gradient(115deg, ${m.map((c, i) => `${c} ${Math.round((i / (m.length - 1)) * 100)}%`).join(', ')})`
}

/**
 * Every CSS custom property the UI reads, without the leading `--`. The
 * shared tokens (paper, ink, detail, side, line, sel…) are what components
 * use; the Plain look sets them from its `p-*` tokens.
 */
export function appearanceTokens(app: AppAppearance, endpaper: VaultAppearance, theme: PaletteTheme): Record<string, string> {
  const st = STOCK[endpaper.palette]
  const black = app.page === 'black'
  const g = gilt(theme)
  const t: Record<string, string> = {
    gilt: g,
    foil: foil(theme),
    'detail-chrome': st.detail,
    marbleimg: marblePlaceholder(theme, endpaper.tone),
    pdf: '#FFFFFF',
  }
  if (black) {
    const ink = '#E2DED6'
    Object.assign(t, {
      paper: st.black,
      ink,
      'ink-soft': mix(ink, st.black, 0.38),
      pencil: mix(ink, st.black, 0.55),
      detail: g,
      srcbg: mix(st.black, '#FFFFFF', 0.05),
      math: '#A9C1E0',
      side: mix(st.black, '#FFFFFF', 0.05),
      tabpaper: mix(st.black, '#FFFFFF', 0.1),
    })
  } else {
    Object.assign(t, {
      paper: st.paper,
      ink: st.ink,
      'ink-soft': mix(st.ink, st.paper, 0.42),
      pencil: mix(st.ink, st.paper, 0.55),
      detail: st.detail,
      srcbg: mix(st.paper, st.detail, 0.05),
      math: mix(st.ink, '#3D5A8A', 0.55),
      side: mix(st.paper, '#C9BFAE', 0.22),
      tabpaper: mix(st.paper, '#9C8F7A', 0.2),
    })
  }
  t.line = mix(t.side, t.ink, 0.14)
  t.sel = mix(t.side, t.detail, 0.2)
  t.bar = t.side
  t.desk = t.side
  if (app.look === 'plain') {
    const p = plainTokens(theme, black ? 'dark' : 'light')
    for (const [k, v] of Object.entries(p)) t[`p-${k}`] = v
    Object.assign(t, {
      paper: p.page,
      ink: p.text,
      'ink-soft': p.muted,
      pencil: p.faint,
      detail: p.accent,
      srcbg: p.srcbg,
      math: p.math,
      side: p.side,
      tabpaper: p.chrome,
      line: p.line,
      sel: p.sel,
      bar: p.bar,
      desk: p.desk,
    })
  }
  // The chrome (title bar, activity bar, status bar). Plain is flat in the
  // bar tone; Bench binds it in a material (its tile comes from the renderer).
  // `chl` is the light deboss under chrome text.
  if (app.look === 'plain') {
    Object.assign(t, { chrome: t.bar, 'chrome-ink': t.ink, 'chrome-ink-soft': t['ink-soft'], 'chrome-active': t.ink, 'chrome-btn': t.sel, chl: 'transparent' })
  } else {
    Object.assign(t, BINDING_CHROME[chromeMaterial(app)](g, st.detail))
    t.desk = app.desk === 'felt' ? '#605A53' : '#5C3826'
  }
  // Status colours, readable on either page.
  Object.assign(
    t,
    black ? { ok: '#7DBE84', err: '#F08A7E', warn: '#E0B65A' } : { ok: '#1A7F37', err: '#C62F2B', warn: '#9A6700' },
  )
  return t
}

/** What the Bench chrome is bound in: black pages force dark leather. */
export function chromeMaterial(app: AppAppearance): Binding | 'dark' {
  return app.page === 'black' ? 'dark' : app.binding
}

// Icons and text stay high-contrast on every material.
const BINDING_CHROME: Record<Binding | 'dark', (gilt: string, detail: string) => Record<string, string>> = {
  saddle: () => ({ chrome: '#A8703F', 'chrome-ink': '#2A170A', 'chrome-ink-soft': '#4A2E18', 'chrome-active': '#0F0703', 'chrome-btn': 'rgba(255, 240, 215, 0.16)', chl: 'rgba(255, 232, 196, 0.38)' }),
  linen: (_g, detail) => ({ chrome: '#CDC6B4', 'chrome-ink': '#26231F', 'chrome-ink-soft': '#4F4A42', 'chrome-active': detail, 'chrome-btn': 'rgba(255, 255, 255, 0.3)', chl: 'rgba(255, 255, 255, 0.5)' }),
  dark: (gilt) => ({ chrome: '#4A2A1A', 'chrome-ink': '#F0DDB8', 'chrome-ink-soft': '#D2BB92', 'chrome-active': gilt, 'chrome-btn': 'rgba(0, 0, 0, 0.2)', chl: 'rgba(0, 0, 0, 0.65)' }),
}

/** The CSS font stack for a page typeface (the bundled fonts register these family names). */
export function pageFontStack(face: Typeface): string {
  const family = face === 'Crimson Pro' || face === 'EB Garamond' ? `${face} Variable` : face
  return `'${family}', Georgia, 'Times New Roman', serif`
}
