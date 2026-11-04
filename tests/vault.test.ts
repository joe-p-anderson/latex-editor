import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Vault } from '../src/main/vault'

describe('template libraries', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("searches the vault's own library before the global one", async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    writeFileSync(join(dir, '.vault.json'), JSON.stringify({ templates: 'tpl' }))
    const vault = new Vault(dir, 'C:/global')
    await vault.load()
    expect(vault.templateDirs).toEqual([resolve(realpathSync.native(dir), 'tpl'), 'C:/global'])
    expect((await vault.info()).globalTemplates).toBe('C:/global')
  })

  it('uses only the global library when .vault.json names none', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    const vault = new Vault(dir, 'C:/global')
    await vault.load()
    expect(vault.templateDirs).toEqual(['C:/global'])
  })
})

describe('.vault.json', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps every change when several are saved at once', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-'))
    writeFileSync(join(dir, '.vault.json'), JSON.stringify({ snippets: 'mine.txt' }))
    const vault = new Vault(dir, null)
    await vault.load()
    await Promise.all([
      vault.saveAppearance({ palette: 'oxblood-gilt' }),
      vault.saveAppearance({ marbling: 'peacock' }),
      vault.saveName('Thesis'),
      vault.savePaper('main.tex', true),
      vault.savePlugin('symbols', { enabled: true }),
    ])
    const saved = JSON.parse(readFileSync(join(dir, '.vault.json'), 'utf8'))
    expect(saved).toMatchObject({ snippets: 'mine.txt', name: 'Thesis', papers: ['main.tex'], plugins: { symbols: true }, appearance: { palette: 'oxblood-gilt', marbling: 'peacock' } })
  })
})

describe('the vault root', () => {
  // The temp folder is in short form (C:\Users\JANDER~1\...) on machines
  // whose user folder has an 8.3 name; elsewhere there's nothing to expand.
  it.runIf(tmpdir().includes('~'))('is held in its long form, since TeX reads ~ as a tie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-'))
    try {
      expect(new Vault(dir).root).not.toContain('~')
      expect(new Vault(dir).root.toLowerCase()).toBe(realpathSync.native(dir).toLowerCase())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("is kept as given when the folder can't be resolved", () => {
    expect(new Vault('C:/no/such/vault').root).toBe('C:/no/such/vault')
  })
})
