import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import themes from '../endleaf-marbled-themes/themes.json'
import {
  appearanceTokens,
  DEFAULT_APP_APPEARANCE,
  defaultVaultAppearance,
  mix,
  normalizeAppAppearance,
  normalizeVaultAppearance,
  PALETTES,
  plainTokens,
  type PaletteTheme,
} from '../src/shared/appearance'
import { Vault } from '../src/main/vault'

const THEMES = themes.themes as PaletteTheme[]
const blue = THEMES.find((t) => t.id === 'bookbinders-blue')!

describe('appearance settings', () => {
  it('knows exactly the palettes in themes.json', () => {
    expect([...PALETTES].sort()).toEqual(THEMES.map((t) => t.id).sort())
  })

  it('fills in defaults and clamps bad values', () => {
    expect(normalizeAppAppearance(undefined)).toEqual(DEFAULT_APP_APPEARANCE)
    const a = normalizeAppAppearance({ look: 'bench', page: 'neon', lineLength: 200, textSize: 18.5, typeface: 'EB Garamond' })
    expect(a).toMatchObject({ look: 'bench', page: 'black', lineLength: 96, textSize: 19, typeface: 'EB Garamond' })
  })

  it("gives each vault a fixed seed from its name until it's remarbled", () => {
    expect(defaultVaultAppearance('thesis').seed).toBe(defaultVaultAppearance('thesis').seed)
    expect(defaultVaultAppearance('thesis').seed).not.toBe(defaultVaultAppearance('physics').seed)
    expect(normalizeVaultAppearance({ palette: 'plum-amber', seed: 7 }, 'x')).toEqual({ palette: 'plum-amber', marbling: 'combed', tone: 'rich', seed: 7 })
  })
})

describe('colour tokens', () => {
  it('mixes like the mockup', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })

  it('derives the Plain tokens from the palette mode matching the page', () => {
    const dark = plainTokens(blue, 'dark')
    expect(dark.bar).toBe(blue.modes.dark.label)
    expect(dark.accent).toBe(blue.modes.dark.vein)
    const light = plainTokens(blue, 'light')
    expect(light.page).toBe(blue.modes.light.label)
  })

  it('uses the gilt for details on a black page outside the Plain look', () => {
    const t = appearanceTokens({ ...DEFAULT_APP_APPEARANCE, look: 'bench' }, defaultVaultAppearance('x'), blue)
    expect(t.paper).toBe('#141821')
    expect(t.detail).toBe(t.gilt)
  })

  it("app.css's fallback tokens are the defaults", () => {
    const css = readFileSync(join(__dirname, '../src/renderer/src/app.css'), 'utf8')
    const tokens = appearanceTokens(DEFAULT_APP_APPEARANCE, defaultVaultAppearance('x'), blue)
    for (const [k, v] of Object.entries(tokens)) expect(css, `--${k}`).toContain(`--${k}: ${v};`)
  })
})

describe('vault endpaper', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("saves to .vault.json and keeps the file's other settings", async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    writeFileSync(join(dir, '.vault.json'), JSON.stringify({ images: 'figs' }))
    const vault = new Vault(dir)
    await vault.load()
    await vault.saveAppearance({ palette: 'forest-floor', tone: 'pale' })
    const saved = JSON.parse(readFileSync(join(dir, '.vault.json'), 'utf8'))
    expect(saved.images).toBe('figs')
    expect(saved.appearance).toMatchObject({ palette: 'forest-floor', tone: 'pale', marbling: 'combed' })
    const again = new Vault(dir)
    await again.load()
    expect((await again.info()).appearance.palette).toBe('forest-floor')
  })
})
