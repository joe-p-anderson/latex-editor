import { describe, expect, it } from 'vitest'
import themes from '../endleaf-marbled-themes/themes.json'
import { MARBLINGS } from '../src/shared/appearance'
import { renderMarble } from '../src/shared/marbling'

const pal = themes.themes[0].modes.dark

describe('marbling', () => {
  it('is the same sheet for the same seed, and a different one for another', () => {
    const a = renderMarble(pal, 'combed', 120, 75, 3)
    expect(renderMarble(pal, 'combed', 120, 75, 3)).toEqual(a)
    expect(renderMarble(pal, 'combed', 120, 75, 4)).not.toEqual(a)
  })

  it.each(MARBLINGS.map(([id]) => id))('marbles %s in the palette, fully opaque', (pattern) => {
    const px = renderMarble(pal, pattern, 120, 75, 7)
    expect(px.length).toBe(120 * 75 * 4)
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255)
    // Not a flat fill: some variety across the sheet.
    const reds = new Set<number>()
    for (let i = 0; i < px.length; i += 4 * 37) reds.add(px[i] >> 4)
    expect(reds.size).toBeGreaterThan(3)
  })
})
