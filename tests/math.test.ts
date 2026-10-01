import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractMacros, macrosFor } from '../src/main/mathmacros'
import { Vault } from '../src/main/vault'
import { findMathRegions, regionAt } from '../src/shared/mathregions'
import { createRenderer } from '../src/shared/mathrender'
import { stablePreview } from '../src/shared/mathstable'
import { expandSiunitx, formatNumber, formatUnit } from '../src/shared/siunitx'

const REPO = resolve(import.meta.dirname, '..')

describe('findMathRegions', () => {
  it('finds inline, display and environment math', () => {
    const text = 'a $x^2$ b \\(y\\) c $$z$$ d \\[w\\]\n\\begin{align}\n a &= b\n\\end{align}'
    expect(findMathRegions(text).map((r) => [r.tex.trim(), r.display])).toEqual([
      ['x^2', false],
      ['y', false],
      ['z', true],
      ['w', true],
      ['\\begin{align}\n a &= b\n\\end{align}', true],
    ])
  })
  it('skips comments, escaped dollars and verbatim', () => {
    const text = 'costs \\$5 % $not math$\n\\begin{verbatim}\n$also not$\n\\end{verbatim}\nbut $this$ is'
    expect(findMathRegions(text).map((r) => r.tex)).toEqual(['this'])
  })
  it('marks math left open at the end of a paragraph as unclosed', () => {
    const [r] = findMathRegions('The force $F = ma is\n\nnext')
    expect(r).toMatchObject({ tex: 'F = ma is', closed: false })
  })

  it('stops an unclosed $$ at the paragraph end too', () => {
    const regions = findMathRegions('A stray $$\n\nlater $x$ text')
    expect(regions.map((r) => [r.tex, r.closed])).toEqual([
      ['', false],
      ['x', true],
    ])
  })
  it('regionAt finds the region around an offset, delimiters included', () => {
    const regions = findMathRegions('ab $cd$ ef')
    expect(regionAt(regions, 3)?.tex).toBe('cd')
    expect(regionAt(regions, 7)?.tex).toBe('cd')
    expect(regionAt(regions, 1)).toBeUndefined()
  })
})

describe('siunitx', () => {
  it('formats numbers', () => {
    expect(formatNumber('9.8')).toBe('9.8')
    expect(formatNumber('7.9e-2')).toBe('7.9\\times10^{-2}')
    expect(formatNumber('1e21')).toBe('10^{21}')
    expect(formatNumber('-3.5')).toBe('-3.5')
    expect(formatNumber('1.2+-0.1')).toBe('1.2\\pm0.1')
  })
  it('formats literal units as the documents write them', () => {
    expect(formatUnit('m/s^2')).toBe('\\mathrm{m}/\\mathrm{s}^{2}')
    expect(formatUnit('kg.m/s^2')).toBe('\\mathrm{kg}\\,\\mathrm{m}/\\mathrm{s}^{2}')
    expect(formatUnit('m^3 kg^{-1}')).toBe('\\mathrm{m}^{3}\\,\\mathrm{kg}^{-1}')
    expect(formatUnit('au^3 \\solarmass^{-1}')).toBe('\\mathrm{au}^{3}\\,\\solarmass^{-1}')
  })
  it('formats macro units', () => {
    expect(formatUnit('\\kilo\\meter\\per\\second')).toBe('\\mathrm{km}\\,\\mathrm{s}^{-1}')
    expect(formatUnit('\\meter\\per\\second\\squared')).toBe('\\mathrm{m}\\,\\mathrm{s}^{-2}')
  })
  it('rewrites whole commands and leaves other text alone', () => {
    expect(expandSiunitx('g = \\SI{9.8}{m/s^2}')).toBe('g = 9.8\\,\\mathrm{m}/\\mathrm{s}^{2}')
    expect(expandSiunitx('\\ang{90}')).toBe('90^{\\circ}')
    expect(expandSiunitx('x + y')).toBe('x + y')
  })
})

describe('extractMacros', () => {
  it("reads handout.cls's \\blank with its optional-argument default", () => {
    const cls = readFileSync(join(REPO, 'fixtures/_templates/handout.cls'), 'utf8')
    expect(extractMacros(cls).blank).toEqual(['\\underline{\\hspace{#1}}', 1, '1in'])
  })
  it('handles \\DeclareSIUnit, \\DeclareMathOperator, \\def and \\let, skipping @ internals', () => {
    const m = extractMacros([
      '\\DeclareSIUnit{\\solarmass}{\\text{M}_{\\odot}}',
      '\\DeclareMathOperator*{\\argmax}{arg\\,max}',
      '\\def\\pair#1#2{(#1,#2)}',
      '\\let\\ve\\vec',
      '\\newcommand{\\hd@x}{secret}',
      '\\newcommand{\\uses}{\\hd@x}',
    ].join('\n'))
    expect(m).toEqual({
      solarmass: '\\text{M}_{\\odot}',
      argmax: '\\operatorname*{arg\\,max}',
      pair: ['(#1,#2)', 2],
      ve: '\\vec',
    })
  })
})

describe('createRenderer', () => {
  it('renders SVG and reports unknown commands instead of hiding them', () => {
    const render = createRenderer()
    expect(render('\\frac{1}{2}', false)).toMatchObject({ error: null })
    expect(render('\\frac{1}{2}', false).svg).toMatch(/^<svg/)
    expect(render('\\hatf{x}', false).error).toBe('Undefined control sequence \\hatf')
  })
  it('lets a math-only document macro work inside \\text{}', () => {
    const render = createRenderer({ blank: ['\\underline{\\hspace{#1}}', 1, '1in'] })
    expect(render('x = \\text{a \\blank[1in] b}', false).error).toBeNull()
  })
  it('renders a labelled equation again (renumbered) without "multiply defined"', () => {
    const render = createRenderer()
    expect(render('\\begin{equation} x \\label{a}\\tag{1}\\end{equation}', true).error).toBeNull()
    expect(render('\\begin{equation} x \\label{a}\\tag{35}\\end{equation}', true).error).toBeNull()
  })
})

// Every equation in the real fixture documents must render. Reads the
// committed version of each file, so uncommitted experiments don't count.
describe('fixture corpus', () => {
  it('renders every equation in both vaults without an error', async () => {
    const failures: string[] = []
    let count = 0
    for (const name of ['1200-latex', 'syllabi']) {
      const vault = new Vault(join(REPO, 'fixtures/vaults', name))
      await vault.load()
      const tracked = execFileSync('git', ['ls-files', '*.tex'], { cwd: vault.root, encoding: 'utf8' }).split('\n').filter(Boolean)
      for (const rel of tracked) {
        const text = execFileSync('git', ['show', `HEAD:./${rel}`], { cwd: vault.root, encoding: 'utf8' })
        const render = createRenderer((await macrosFor(vault, rel)).macros)
        for (const r of findMathRegions(text).filter((r) => r.closed)) {
          count++
          const { error } = render(r.tex, r.display)
          if (error) failures.push(`${name}/${rel}: ${error} in ${r.tex.slice(0, 60)}`)
        }
      }
    }
    expect(count).toBeGreaterThan(500)
    expect(failures).toEqual([])
  }, 60_000)
})

describe('stablePreview', () => {
  const render = createRenderer()
  it('keeps the last good rendering while \\hat{x} is typed, then shows the new one', () => {
    let last = stablePreview(render('x', false), true, 0, null, true).last
    const shown: string[] = []
    for (const tex of ['\\hat{', '\\hat{x', '\\hat{x}']) {
      const s = stablePreview(render(tex, false), true, 0, last, false)
      last = s.last
      shown.push(s.shown.stale ? 'last good' : s.shown.error ? 'error' : 'new')
    }
    expect(shown).toEqual(['last good', 'last good', 'new'])
  })
  it('reports the error once typing settles, still showing the last good rendering', () => {
    const last = stablePreview(render('x', false), true, 0, null, true).last
    const s = stablePreview(render('\\hat{', false), true, 0, last, true)
    expect(s.shown).toMatchObject({ stale: true, svg: last!.svg })
    expect(s.shown.error).toBeTruthy()
  })
  it("doesn't carry a rendering over to other math", () => {
    const last = stablePreview(render('x', false), true, 0, null, true).last
    expect(stablePreview(render('\\hat{', false), true, 50, last, false).shown).toMatchObject({ svg: null, error: null })
  })
})
