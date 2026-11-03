import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listStarters } from '../src/main/starters'
import { Vault } from '../src/main/vault'
import type { PluginManifest } from '../src/shared/plugin'

const plugin: PluginManifest = {
  id: 'p',
  name: 'P',
  description: '',
  icon: '',
  defaultEnabled: true,
  starters: [{ name: 'Problem', description: 'A problem', text: '{{Problem text}}\n' }],
}

describe('plugin starters', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists a plugin starter with the built-in ones', async () => {
    dir = mkdtempSync(join(tmpdir(), 'starters-'))
    const got = await listStarters(new Vault(join(dir, 'vault'), join(dir, 'global')), [plugin])
    const s = got.find((x) => x.name === 'Problem')
    expect(s).toMatchObject({ source: 'built-in', ext: '.tex', id: 'plugin:p:0' })
  })

  it('gives way to a starter of the user with the same name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'starters-'))
    mkdirSync(join(dir, 'global', 'starters'), { recursive: true })
    writeFileSync(join(dir, 'global', 'starters', 'problem.tex'), 'mine {{Problem text}}')
    const got = (await listStarters(new Vault(join(dir, 'vault'), join(dir, 'global')), [plugin])).filter((x) => x.name.toLowerCase() === 'problem')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ source: 'global', text: 'mine {{Problem text}}' })
  })
})
