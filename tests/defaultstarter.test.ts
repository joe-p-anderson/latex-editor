import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listStarters } from '../src/main/starters'
import { Vault } from '../src/main/vault'
import { DEFAULT_STARTER, defaultStarter } from '../src/shared/starters'

describe('default starter', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const vaultIn = (d: string) => new Vault(join(d, 'vault'), join(d, 'global'))

  it('ships as Lab report (revtex), which also makes references.bib', async () => {
    dir = mkdtempSync(join(tmpdir(), 'starters-'))
    const starters = await listStarters(vaultIn(dir))
    const s = defaultStarter(starters, null, DEFAULT_STARTER)
    expect(s?.name).toBe('Lab report (revtex)')
    expect(s?.ext).toBe('.tex')
    expect(s?.text).toContain('\\documentclass[reprint,aps]{revtex4-2}')
    expect(s?.text).toContain('\\bibliography{references}')
    expect(s?.companions?.map((c) => c.name)).toEqual(['references.bib'])
    expect(s?.companions?.[0].text).toMatch(/@\w+\{/)
  })

  it("prefers the vault's default, then the app's, ignoring case", async () => {
    dir = mkdtempSync(join(tmpdir(), 'starters-'))
    const starters = await listStarters(vaultIn(dir))
    expect(defaultStarter(starters, 'article', DEFAULT_STARTER)?.name).toBe('Article')
    expect(defaultStarter(starters, null, 'Handout')?.name).toBe('Handout')
  })

  it("falls back to the app's default when the vault's names no starter", async () => {
    dir = mkdtempSync(join(tmpdir(), 'starters-'))
    const starters = await listStarters(vaultIn(dir))
    expect(defaultStarter(starters, 'Gone', 'Article')?.name).toBe('Article')
    expect(defaultStarter(starters, 'Gone', 'Also gone')?.name).toBe(DEFAULT_STARTER)
  })

  it("picks the user's own starter over a built-in one of the same name", async () => {
    dir = mkdtempSync(join(tmpdir(), 'starters-'))
    mkdirSync(join(dir, 'global', 'starters'), { recursive: true })
    writeFileSync(join(dir, 'global', 'starters', 'Article.tex'), 'mine')
    const starters = await listStarters(vaultIn(dir))
    expect(defaultStarter(starters, 'Article', DEFAULT_STARTER)?.source).toBe('global')
  })
})

describe("the vault's default starter in .vault.json", () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('is unset in a new vault', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    const vault = new Vault(dir)
    await vault.load()
    expect(vault.defaultStarter).toBeNull()
  })

  it('round-trips, keeping the other settings', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    writeFileSync(join(dir, '.vault.json'), JSON.stringify({ images: 'figs' }))
    const first = new Vault(dir)
    await first.load()
    await first.saveDefaultStarter('Article')
    expect(JSON.parse(readFileSync(join(dir, '.vault.json'), 'utf8'))).toMatchObject({ images: 'figs', defaultStarter: 'Article' })
    const again = new Vault(dir)
    await again.load()
    expect(again.defaultStarter).toBe('Article')
  })

  it('ignores a value that is not a name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    writeFileSync(join(dir, '.vault.json'), JSON.stringify({ defaultStarter: 42 }))
    const vault = new Vault(dir)
    await vault.load()
    expect(vault.defaultStarter).toBeNull()
  })
})
