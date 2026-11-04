// End to end: a vault made from the Lab report (revtex) starter builds clean
// as it comes, references.bib and all.
// Needs MiKTeX: npm run test:e2e
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compile } from '../src/main/compile'
import { makeVault, newVaultChoices } from '../src/main/newvault'
import { formatsBuilt } from '../src/main/preamble'
import { Vault } from '../src/main/vault'

const dir = mkdtempSync(join(tmpdir(), 'endleaf-starters-'))
afterAll(async () => {
  await formatsBuilt() // a clean build makes a preamble format in the background
  rmSync(dir, { recursive: true, force: true })
})

describe('the Lab report (revtex) starter', () => {
  it('makes main.tex, references.bib and figures/, and builds without errors', async () => {
    const root = join(dir, 'Pendulum lab')
    const { starters } = await newVaultChoices(root, null, 'Lab report (revtex)')
    const lab = starters.find((s) => s.name === 'Lab report (revtex)')!
    const main = await makeVault(root, { name: 'Pendulum lab', starter: lab.id }, null)
    expect(main).toBe('main.tex')
    expect(existsSync(join(root, 'references.bib'))).toBe(true)
    expect(existsSync(join(root, 'figures'))).toBe(true)

    const vault = new Vault(root)
    await vault.load()
    const result = await compile(vault, main)
    expect(result.problems.filter((p) => p.severity === 'error')).toEqual([])
  })
})
