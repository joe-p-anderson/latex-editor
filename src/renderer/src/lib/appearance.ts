// Applies the appearance settings to the page: the colour tokens as CSS
// custom properties on <html>, plus data-look and data-page for the CSS that
// differs between looks.
import themes from '../../../../endleaf-marbled-themes/themes.json'
import { marbleCss } from './marbles.svelte'
import { material } from './materials'
import { appearanceTokens, chromeMaterial, pageFontStack, type AppAppearance, type PaletteId, type PaletteTheme, type VaultAppearance } from '@shared/appearance'

export const PALETTE_THEMES = themes.themes as PaletteTheme[]

export function paletteTheme(id: PaletteId): PaletteTheme {
  return PALETTE_THEMES.find((t) => t.id === id) ?? PALETTE_THEMES[0]
}

// The palettes' logos in three tiers: full (96 px and up), mid (24–64 px) and small (20 px and under).
const logos = import.meta.glob('../../../../endleaf-marbled-themes/icons/*-dark-*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export function logoUrl(id: PaletteId, tier: 'full' | 'mid' | 'small'): string | undefined {
  return Object.entries(logos).find(([path]) => path.endsWith(`/${id}-dark-${tier}.svg`))?.[1]
}
export const smallLogo = (id: PaletteId) => logoUrl(id, 'small')

/** Sets the tokens on <html>, and returns them. */
export function applyAppearance(app: AppAppearance, endpaper: VaultAppearance): Record<string, string> {
  const root = document.documentElement
  const tokens = appearanceTokens(app, endpaper, paletteTheme(endpaper.palette))
  // The vault's endpaper, once it's marbled (the palette's gradient until then).
  tokens.marbleimg = marbleCss(endpaper)
  // Bench materials: the paper grain, the chrome's binding and the desk.
  const bench = app.look === 'bench'
  const url = (m: Parameters<typeof material>[0]) => `url(${material(m)})`
  tokens.grainimg = bench ? url('grain') : 'none'
  tokens['chrome-img'] = bench ? url(({ saddle: 'saddle', linen: 'linen', dark: 'leather' } as const)[chromeMaterial(app)]) : 'none'
  tokens.leatherimg = bench ? url('leather') : 'none'
  tokens.deskimg = bench ? url(app.desk) : 'none'
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v)
  root.style.setProperty('--f-page', pageFontStack(app.typeface))
  root.style.setProperty('--page-size', `${app.textSize}px`)
  setMeasure(app)
  root.dataset.look = app.look
  root.dataset.page = app.page
  root.dataset.tabs = app.tabs
  root.style.colorScheme = app.page === 'black' ? 'dark' : 'light'
  return tokens
}

// Prose for measuring a face's average character width: ordinary sentences,
// with the spaces and punctuation real text has.
const SAMPLE =
  'The problem of strain hardening in metals is one of the last frontiers of classical physics. A first-principles ' +
  'solution would involve a dynamical theory of dislocations, the line defects that carry plastic deformation, and ' +
  'it would have to predict how they organise themselves into walls, cells and tangles as the metal is worked. ' +
  'We saw briefly that only the geometrically necessary content and the average orientation give rise to long-range fields.'

/**
 * The text column's width (--textw): the line length in characters times the
 * face's average character width at the text size. 82 characters of Crimson
 * Pro at 19 px is about 606 px. Measured again once the face has loaded.
 */
function setMeasure(app: AppAppearance): void {
  const measure = () => {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `400 ${app.textSize}px ${pageFontStack(app.typeface)}`
    const avg = ctx.measureText(SAMPLE).width / SAMPLE.length
    document.documentElement.style.setProperty('--textw', `${Math.round(avg * app.lineLength)}px`)
  }
  measure()
  const family = pageFontStack(app.typeface).split(',')[0]
  document.fonts.load(`400 ${app.textSize}px ${family}`).then(measure, () => {})
}
