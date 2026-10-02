// End to end: the preamble format and preview builds, with pdflatex.
// Runs in a temporary copy of the 1200-latex vault. Needs MiKTeX: npm run test:e2e
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CompileResult } from '../src/shared/api'
import { compile, compileDraft } from '../src/main/compile'
import { formatsBuilt } from '../src/main/preamble'
import { forward } from '../src/main/synctex'
import { Vault } from '../src/main/vault'

const SOURCE = resolve(import.meta.dirname, '../fixtures/vaults/1200-latex')
const DOC = 'Homework/HW3_vectors.tex'
// The long path: TeX can't read a Windows short name (JANDER~1).
const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'latex-editor-fast-')))
let vault: Vault

const pages = (log: string) => Number(/Output written on .*\((\d+) pages?/.exec(log)?.[1] ?? 0)
const errors = (r: CompileResult) => r.problems.filter((p) => p.severity === 'error' && !p.hidden)

beforeAll(async () => {
  cpSync(SOURCE, dir, { recursive: true, filter: (src) => !/[\\/](\.texcache|pdf)$/.test(src) })
  const settings = JSON.parse(readFileSync(join(SOURCE, '.vault.json'), 'utf8'))
  writeFileSync(join(dir, '.vault.json'), JSON.stringify({ ...settings, templates: resolve(SOURCE, settings.templates) }))
  vault = new Vault(dir)
  await vault.load()
}, 60_000)
afterAll(async () => {
  await formatsBuilt()
  rmSync(dir, { recursive: true, force: true })
})

describe('preamble format', () => {
  it('is built after a clean save and used by the next build, with the same result', async () => {
    const first = await compile(vault, DOC)
    expect(errors(first)).toEqual([])
    expect(first.preloaded).toBe(false)
    await formatsBuilt()
    const second = await compile(vault, DOC)
    expect(second.preloaded).toBe(true)
    expect(errors(second)).toEqual([])
    expect(pages(second.log)).toBe(pages(first.log))
  })
})

describe('a folder with a space in its name', () => {
  it('builds and loads the format', async () => {
    const doc = 'Lecture handouts/vectors.tex'
    writeFileSync(join(dir, doc), readFileSync(join(dir, DOC)))
    expect(errors(await compile(vault, doc))).toEqual([])
    await formatsBuilt()
    const again = await compile(vault, doc)
    expect(again.preloaded).toBe(true)
    expect(errors(again)).toEqual([])
    const draft = await compileDraft(vault, doc, { [doc]: readFileSync(join(dir, doc), 'utf8').replace('\\maketitle', '\\maketitle\nEdited.') })
    expect(errors(draft!)).toEqual([])
    expect(pages(draft!.log)).toBeGreaterThan(0)
  })
})

describe('preview build', () => {
  const original = () => readFileSync(join(dir, DOC), 'utf8')

  it('builds unsaved text without touching the vault or pdf/', async () => {
    const published = join(dir, 'pdf', 'Homework', 'HW3_vectors.pdf')
    const before = statSync(published).mtimeMs
    const text = original()
    const lines = text.split(/\r?\n/)
    const at = lines.findIndex((l) => l.includes('\\begin{document}')) + 1
    lines.splice(at, 0, 'Preview marker paragraph.')
    const r = await compileDraft(vault, DOC, { [DOC]: lines.join('\n') })
    expect(r?.draft).toBe(true)
    expect(errors(r!)).toEqual([])
    expect(r!.log).not.toMatch(/\.shadow/)
    expect(original()).toBe(text)
    expect(statSync(published).mtimeMs).toBe(before)
    // SyncTeX points at the vault's file, and knows the new line.
    expect(await forward(r!.pdf!, join(dir, DOC), at + 1)).not.toBeNull()
  })

  it('reports errors in unsaved text against the vault file and line', async () => {
    const lines = original().split(/\r?\n/)
    const at = lines.findIndex((l) => l.includes('\\begin{document}')) + 1
    lines.splice(at, 0, '\\notACommandAnywhere')
    const r = await compileDraft(vault, DOC, { [DOC]: lines.join('\n') })
    const e = errors(r!)[0]
    expect(e?.file).toBe(DOC)
    expect(e?.line).toBe(at + 1)
  })

  it("doesn't use the format when the unsaved preamble differs", async () => {
    const text = original().replace('\\begin{document}', '\\usepackage{xcolor}\n\\begin{document}')
    const r = await compileDraft(vault, DOC, { [DOC]: text })
    expect(r?.preloaded).toBe(false)
    expect(errors(r!)).toEqual([])
  })
})

describe('a format pdflatex cannot load', () => {
  it('is dropped, and the build runs without it', async () => {
    await compile(vault, DOC)
    await formatsBuilt()
    // Wreck the cached format (MiKTeX dies the same way on a very long format path).
    const fmt = join(dir, '.texcache', 'Homework', 'HW3_vectors', 'HW3_vectors-preamble.fmt')
    writeFileSync(fmt, 'not a format')
    const r = await compile(vault, DOC)
    expect(r.preloaded).toBe(false)
    expect(errors(r)).toEqual([])
    expect(pages(r.log)).toBeGreaterThan(0)
  })
})
