import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
