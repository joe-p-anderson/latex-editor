// End to end: BibTeX as part of a build, on the revtex paper fixture.
// Runs in a temporary copy of the AngStatsRevTex vault. Needs MiKTeX: npm run test:e2e
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CompileResult } from '../src/shared/api'
import { bibInfo } from '../src/main/bibliography'
import { cacheDirFor, compile, compileDraft } from '../src/main/compile'
import { formatsBuilt } from '../src/main/preamble'
import { Vault } from '../src/main/vault'

const SOURCE = resolve(import.meta.dirname, '../fixtures/vaults/AngStatsRevTex')
const DOC = 'main.tex'
const BIB = 'AngStatsBib.bib'
// The long path: TeX can't read a Windows short name (JANDER~1).
const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'latex-editor-bib-')))
let vault: Vault

const undefinedCites = (r: CompileResult) => r.problems.filter((p) => p.rule === 'undefined-citation')
const errors = (r: CompileResult) => r.problems.filter((p) => p.severity === 'error' && !p.hidden)
const bblTime = () => statSync(join(cacheDirFor(vault, DOC), 'main.bbl')).mtimeMs

beforeAll(async () => {
  cpSync(SOURCE, dir, { recursive: true, filter: (src) => !/[\\/](\.texcache|pdf)$/.test(src) })
  vault = new Vault(dir)
  await vault.load()
}, 60_000)
afterAll(async () => {
  await formatsBuilt()
  rmSync(dir, { recursive: true, force: true })
})

describe('bibtex in a build', () => {
  it('runs BibTeX and resolves every citation', async () => {
    const r = await compile(vault, DOC)
    expect(errors(r)).toEqual([])
    expect(undefinedCites(r)).toEqual([])
    expect(r.ok).toBe(true)
    const info = await bibInfo(vault, DOC, cacheDirFor(vault, DOC))
    expect(info.bibs).toEqual([BIB])
    expect(info.labels.kocksPhysicsPhenomenologyStrain2003).toMatch(/^\d+$/)
  }, 180_000)

  it("doesn't rerun BibTeX when the citations haven't changed", async () => {
    const before = bblTime()
    const r = await compile(vault, DOC)
    expect(undefinedCites(r)).toEqual([])
    expect(bblTime()).toBe(before)
  }, 180_000)

  it('offers the right key for a mistyped citation', async () => {
    const intro = readFileSync(join(dir, '1_Intro.tex'), 'utf8').replace('\\cite{kocksPhysicsPhenomenologyStrain2003}', '\\cite{kocksPhysicsPhenomenologyStrain2030}')
    const r = await compileDraft(vault, '1_Intro.tex', { '1_Intro.tex': intro })
    const p = undefinedCites(r!).find((q) => q.title.includes('Strain2030'))
    expect(p).toBeTruthy()
    expect(p!.file).toBe('1_Intro.tex')
    expect(p!.fixes[0]?.label).toBe('Change to kocksPhysicsPhenomenologyStrain2003')
  }, 180_000)

  it('runs biber for a biblatex document', async () => {
    const doc = 'Notes/biblatex.tex'
    mkdirSync(join(dir, 'Notes'), { recursive: true })
    writeFileSync(
      join(dir, doc),
      ['\\documentclass{article}', '\\usepackage[backend=biber]{biblatex}', '\\addbibresource{../AngStatsBib.bib}', '\\begin{document}', 'See \\cite{Acharya2001}.', '\\printbibliography', '\\end{document}', ''].join('\n'),
    )
    const r = await compile(vault, doc)
    expect(errors(r)).toEqual([])
    expect(undefinedCites(r)).toEqual([])
    expect(statSync(join(cacheDirFor(vault, doc), 'biblatex.bbl')).size).toBeGreaterThan(0)
  }, 180_000)

  // The Acharya2001 entry with its author field missing the "=".
  const brokenBib = () => {
    const bib = readFileSync(join(dir, BIB), 'utf8')
    const at = bib.indexOf('@article{Acharya2001')
    const text = bib.slice(0, at) + bib.slice(at).replace(/\n  author = /, '\n  author  ')
    return { text, line: text.slice(0, text.indexOf('author  ', at)).split('\n').length }
  }

  it('reports a broken .bib entry at its line (BibTeX)', async () => {
    const broken = brokenBib()
    const r = await compileDraft(vault, DOC, { [BIB]: broken.text })
    const p = r!.problems.find((q) => q.rule === 'bibtex-error')
    expect(p).toBeTruthy()
    expect(p!.file).toBe(BIB)
    expect(Math.abs(p!.line! - broken.line)).toBeLessThanOrEqual(1)
  }, 180_000)

  it('reports a broken .bib entry at its line (biber)', async () => {
    const broken = brokenBib()
    const r = await compileDraft(vault, 'Notes/biblatex.tex', { [BIB]: broken.text })
    const p = r!.problems.find((q) => q.rule === 'biber-error' && q.line != null)
    expect(p).toBeTruthy()
    expect(p!.file).toBe(BIB)
    expect(Math.abs(p!.line! - broken.line)).toBeLessThanOrEqual(1)
  }, 180_000)
})
