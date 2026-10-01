// End to end: a multi-part paper in a subfolder of the vault, marked in
// .vault.json. Runs in a temporary vault holding a copy of the AngStatsRevTex
// paper under Paper/. Needs MiKTeX: npm run test:e2e
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compile, resolveRoot } from '../src/main/compile'
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
})
