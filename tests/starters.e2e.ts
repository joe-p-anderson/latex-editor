// End to end: a vault made from each built-in folder starter builds clean as
// it comes, references.bib and sections and all.
// Needs a TeX distribution (skipped without one): npm run test:e2e
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compile } from '../src/main/compile'
import { makeVault, newVaultChoices } from '../src/main/newvault'
import { formatsBuilt } from '../src/main/preamble'
import { findTeX } from '../src/main/tex'
import { Vault } from '../src/main/vault'
import { DEFAULT_STARTER } from '../src/shared/starters'

const dir = mkdtempSync(join(tmpdir(), 'endleaf-starters-'))
afterAll(async () => {
  await formatsBuilt() // a clean build makes a preamble format in the background
  rmSync(dir, { recursive: true, force: true })
})

const tex = await findTeX()
const { starters } = await newVaultChoices(join(dir, 'probe'), null, DEFAULT_STARTER)
const folders = starters.filter((s) => s.source === 'built-in' && s.files?.length)

describe.skipIf(!tex)('every built-in folder starter', () => {
  it('includes the four folder shapes', () => {
    expect(folders.map((s) => s.name).sort()).toEqual([
      'Lab report (revtex)',
      'Long lab report (revtex)',
      'Presentation (beamer)',
      'Problem set',
    ])
  })

  it.each(folders.map((s) => s.name))('%s makes a vault with figures/ that builds without errors', async (name) => {
    const root = join(dir, name)
    const starter = folders.find((s) => s.name === name)!
    const main = await makeVault(root, { name, starter: starter.id }, null)
    expect(main).toBe('main.tex')
    expect(existsSync(join(root, 'figures'))).toBe(true)

    const vault = new Vault(root)
    await vault.load()
    const result = await compile(vault, main)
    expect(result.problems.filter((p) => p.severity === 'error')).toEqual([])
  })

  it('Long lab report (revtex) brings in its sections from sections/, with references.bib', () => {
    const long = folders.find((s) => s.name === 'Long lab report (revtex)')!
    const sections = ['introduction', 'theory', 'methods', 'results', 'conclusion', 'appendix']
    expect(long.files?.map((f) => f.path).sort()).toEqual(
      ['figures', 'references.bib', ...sections.map((s) => `sections/${s}.tex`)].sort(),
    )
    for (const s of sections) expect(long.text).toContain(`\\input{sections/${s}}`)
  })
})
