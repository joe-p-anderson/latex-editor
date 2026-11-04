import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    expect(vault.templateDirs).toEqual([resolve(dir, 'tpl'), 'C:/global'])
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
