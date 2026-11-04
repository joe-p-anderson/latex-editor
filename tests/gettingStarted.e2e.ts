// End to end: the bundled Getting-started vault builds as its prose promises.
// The first build stops on the one deliberate slip; fixing it gives a clean build.
// Needs MiKTeX: npm run test:e2e
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compile } from '../src/main/compile'
import { openCopy } from '../src/main/gettingStarted'
import { formatsBuilt } from '../src/main/preamble'
import { Vault } from '../src/main/vault'

const BUNDLED = resolve(import.meta.dirname, '../resources/getting-started')
const dir = mkdtempSync(join(tmpdir(), 'endleaf-getting-started-'))
afterAll(async () => {
  await formatsBuilt() // a clean build makes a preamble format in the background
  rmSync(dir, { recursive: true, force: true })
})

describe('the Getting-started vault', () => {
  it('shows exactly one error, the misspelt \\emph, then builds clean once it is fixed', async () => {
    const root = join(dir, 'Getting started')
    await openCopy(BUNDLED, root)
    const vault = new Vault(root)
    await vault.load()

    const first = await compile(vault, 'main.tex')
    const errors = first.problems.filter((p) => p.severity === 'error' && !p.hidden && !p.followOn)
    expect(errors.map((p) => [p.rule, p.file, p.title])).toEqual([['undefined-command', 'main.tex', '\\emhp is not defined']])
    expect(errors[0].explanation).toMatch(/Did you mean \\emph/)

    const main = join(root, 'main.tex')
    writeFileSync(main, readFileSync(main, 'utf8').replace('\\emhp{', '\\emph{'))
    const second = await compile(vault, 'main.tex')
    expect(second.problems.filter((p) => p.severity === 'error')).toEqual([])
    expect(second.problems.filter((p) => p.severity !== 'error' && !p.hidden).map((p) => p.title)).toEqual([])
  })
})
