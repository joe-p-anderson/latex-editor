// End to end: a multi-part paper in a subfolder of the vault, marked in
// .vault.json. Runs in a temporary vault holding a copy of the AngStatsRevTex
// paper under Paper/. Needs MiKTeX: npm run test:e2e
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cacheDirFor, compile, compileSection, fullBuildReason, resolveRoot } from '../src/main/compile'
import { PaperModel } from '../src/shared/papermodel'
import { DEFAULT_LISTS } from '../src/shared/latexedit'
import { formatsBuilt } from '../src/main/preamble'
import { paperInfo } from '../src/main/project'
import { Vault } from '../src/main/vault'

const SOURCE = resolve(import.meta.dirname, '../fixtures/vaults/AngStatsRevTex')
const ROOT = 'Paper/main.tex'
// The long path: TeX can't read a Windows short name (JANDER~1).
const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'latex-editor-paper-')))
let vault: Vault

beforeAll(async () => {
  cpSync(SOURCE, join(dir, 'Paper'), { recursive: true, filter: (src) => !/[\\/](\.texcache|pdf)$/.test(src) })
  writeFileSync(join(dir, '.vault.json'), JSON.stringify({ papers: [ROOT] }))
  vault = new Vault(dir)
  await vault.load()
}, 60_000)
afterAll(async () => {
  await formatsBuilt()
  rmSync(dir, { recursive: true, force: true })
})

describe('a marked paper in a subfolder', () => {
  it('is the root of each of its files, before anything was built', async () => {
    expect(await resolveRoot(vault, 'Paper/3_reduced.tex')).toBe(ROOT)
    expect(await resolveRoot(vault, ROOT)).toBe(ROOT)
    const info = await paperInfo(vault, ROOT)
    expect(info.declared).toBe(true)
    expect(info.name).toBe('main')
    expect(info.files.map((f) => f.rel)).toContain('Paper/A_Appendices.tex')
  })

  it('builds, finding its pieces, figures and bibliography in its own folder', async () => {
    const r = await compile(vault, 'Paper/3_reduced.tex')
    expect(r.root).toBe(ROOT)
    expect(r.problems.filter((p) => p.severity === 'error' && !p.hidden)).toEqual([])
    expect(r.problems.filter((p) => p.rule === 'undefined-citation')).toEqual([])
    expect(r.ok).toBe(true)
  }, 240_000)

  it('builds one section alone, numbered as in the whole paper, and quicker', async () => {
    const full = await compile(vault, ROOT)
    expect(full.ok).toBe(true)
    const info = await paperInfo(vault, ROOT)
    const model = new PaperModel(ROOT, info.files, (rel) => info.texts[rel]?.replace(/\r\n/g, '\n') ?? null, DEFAULT_LISTS)
    const unit = 'Paper/3_reduced.tex'
    const r = await compileSection(vault, unit, {}, unit, model.files.get(unit)!.start, '§III')
    expect(r).toBeTruthy()
    expect(r!.problems.filter((p) => p.severity === 'error' && !p.hidden)).toEqual([])
    expect(r!.section).toBe('§III')
    expect(r!.pdf).toMatch(/main-section\.pdf$/)
    expect(r!.durationMs).toBeLessThan(full.durationMs)
    // Its own .aux has the section's labels with the whole paper's numbers.
    const aux = readFileSync(join(cacheDirFor(vault, ROOT), 'main-section.aux'), 'utf8')
    const number = (key: string) => new RegExp(`\\\\newlabel\\{${key}\\}\\{\\{([^}]*)\\}`).exec(aux)?.[1]
    expect(number('sec:3_reduced_descriptions')).toBe('III')
    expect(number('eq:1circavAltens')).toBe('35e')
    expect(number('eq:18_loctoglobclos')).toBe('66')
  }, 240_000)

  it('saves into a full build only when the section alone would be wrong', async () => {
    const text = readFileSync(join(dir, 'Paper/3_reduced.tex'), 'utf8')
    expect(await fullBuildReason(vault, ROOT, 'Paper/3_reduced.tex', text)).toBeNull()
    expect(await fullBuildReason(vault, ROOT, 'Paper/3_reduced.tex', `${text}\n\\label{brand:new}`)).toMatch(/New label/)
    expect(await fullBuildReason(vault, ROOT, 'Paper/3_reduced.tex', `${text}\n\\cite{Acharya2001}`)).toMatch(/New citation/)
    // Another file saved since: its numbers may have moved.
    const intro = join(dir, 'Paper/1_Intro.tex')
    writeFileSync(intro, readFileSync(intro, 'utf8'))
    expect(await fullBuildReason(vault, ROOT, 'Paper/3_reduced.tex', text)).toMatch(/1_Intro\.tex changed/)
  })
})
