import { describe, expect, it } from 'vitest'
import themes from '../endleaf-marbled-themes/themes.json'
import { DEFAULT_APP_APPEARANCE, defaultVaultAppearance, plateTokens, type PaletteTheme } from '../src/shared/appearance'

const THEMES = themes.themes as PaletteTheme[]
const theme = (id: string) => THEMES.find((t) => t.id === id)!
const vault = (palette: 'bookbinders-blue' | 'oxblood-gilt') => ({ ...defaultVaultAppearance('v'), palette })

describe("the welcome bookplate previews a vault's colours", () => {
  it("takes the hovered vault's paper and ink", () => {
    const app = { ...DEFAULT_APP_APPEARANCE, look: 'bench' as const, page: 'paper' as const }
    const t = plateTokens(app, vault('oxblood-gilt'), theme('oxblood-gilt'))
    expect(t.paper).toBe('#F6EFE3')
    expect(t.ink).toBe('#281C1B')
  })

  it("shows the palette's black page under a black page setting", () => {
    const app = { ...DEFAULT_APP_APPEARANCE, look: 'bench' as const, page: 'black' as const }
    expect(plateTokens(app, vault('bookbinders-blue'), theme('bookbinders-blue')).paper).toBe('#141821')
  })

  it('sets only the tokens the plate reads, so nothing else on the page changes', () => {
    const t = plateTokens(DEFAULT_APP_APPEARANCE, vault('bookbinders-blue'), theme('bookbinders-blue'))
    expect(Object.keys(t).sort()).toEqual(['detail', 'ink', 'ink-soft', 'line', 'paper', 'pencil', 'sel'])
  })
})
