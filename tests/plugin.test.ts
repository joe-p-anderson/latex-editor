import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  globToRegExp,
  pluginStates,
  resolveEnabled,
  settingsWithDefaults,
  validSetting,
  whenHolds,
  type PluginManifest,
  type SettingField,
} from '../src/shared/plugin'
import { onAfterBuild, onBeforeBuild, onProblemFixes, runAfterBuild, runBeforeBuild, type BuildEnd } from '../src/main/buildhooks'
import { Vault } from '../src/main/vault'
import { MANIFESTS } from '../src/plugins/manifests'
import type { Problem } from '../src/shared/api'

const manifest = (over: Partial<PluginManifest> = {}): PluginManifest => ({
  id: 'demo',
  name: 'Demo',
  description: '',
  icon: 'gear',
  defaultEnabled: false,
  ...over,
})

describe('resolveEnabled', () => {
  it('takes the vault’s choice, then the global default, then the manifest’s', () => {
    const m = manifest({ defaultEnabled: true })
    expect(resolveEnabled(m)).toBe(true)
    expect(resolveEnabled(m, { enabled: false })).toBe(false)
    expect(resolveEnabled(m, { enabled: false }, true)).toBe(true)
    expect(resolveEnabled(m, { enabled: true }, { enabled: false, settings: {} })).toBe(false)
    // A vault entry with only settings follows the default.
    expect(resolveEnabled(m, { enabled: false }, { settings: { a: 1 } })).toBe(false)
  })
})

describe('settings', () => {
  const fields: SettingField[] = [
    { key: 'on', label: 'On', type: 'bool', default: true },
    { key: 'n', label: 'N', type: 'number', default: 3, min: 1, max: 5 },
    { key: 'mode', label: 'Mode', type: 'enum', options: ['a', 'b'], default: 'a' },
    { key: 'dir', label: 'Dir', type: 'vaultDir', default: 'Problems' },
  ]

  it('fills defaults, keeps valid values and drops the rest', () => {
    expect(settingsWithDefaults(fields, { on: false, n: 9, mode: 'b', dir: '../x', stray: 'x' })).toEqual({ on: false, n: 3, mode: 'b', dir: 'Problems' })
    expect(settingsWithDefaults(undefined, { a: 1 })).toEqual({})
  })

  it('keeps vault paths inside the vault', () => {
    const dir = fields[3]
    expect(validSetting(dir, 'Problems/kinematics')).toBe(true)
    expect(validSetting(dir, 'C:/elsewhere')).toBe(false)
    expect(validSetting(dir, '/abs')).toBe(false)
    expect(validSetting(dir, 'a/../../b')).toBe(false)
  })

  it('builds each plugin’s state', () => {
    const m = manifest({ settings: { vault: [fields[0]], global: [fields[1]] } })
    const [s] = pluginStates([m], { demo: { enabled: true, settings: { n: 4 } } }, { demo: { settings: { on: false } } })
    expect(s).toMatchObject({ enabled: true, enabledByDefault: true, vaultChose: false, globalSettings: { n: 4 }, vaultSettings: { on: false } })
  })
})

describe('globs and when', () => {
  it('matches file names anywhere, or paths from the root', () => {
    expect(globToRegExp('*.bib').test('refs/main.bib')).toBe(true)
    expect(globToRegExp('*.bib').test('main.bibx')).toBe(false)
    expect(globToRegExp('Problems/**/*.tex').test('Problems/a/b.tex')).toBe(true)
    expect(globToRegExp('Problems/**/*.tex').test('Problems/b.tex')).toBe(true)
    expect(globToRegExp('Problems/*.tex').test('Problems/a/b.tex')).toBe(false)
  })

  it('needs every condition given', () => {
    const files = () => ['a.tex', 'refs.bib']
    expect(whenHolds(undefined, files, null)).toBe(true)
    expect(whenHolds({ vaultHas: '*.bib' }, files, null)).toBe(true)
    expect(whenHolds({ vaultHas: '*.bib', fileIs: '*.tex' }, files, null)).toBe(false)
    expect(whenHolds({ vaultHas: '*.bib', fileIs: '*.tex' }, files, 'a.tex')).toBe(true)
  })
})

describe('manifests', () => {
  it('have unique, dashed ids and icons', () => {
    const ids = MANIFESTS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MANIFESTS) {
      expect(m.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(m.icon).toBeTruthy()
      for (const f of [...(m.settings?.global ?? []), ...(m.settings?.vault ?? [])]) expect(validSetting(f, f.default)).toBe(true)
    }
  })
})

describe('build hooks', () => {
  const problem = (rule: string): Problem => ({ rule, severity: 'error', file: 'a.tex', line: 1, title: rule, fixes: [], tex: '' })

  it('add problems and fixes, survive a failing hook, and unregister', async () => {
    const seen: string[] = []
    const offs = [
      onBeforeBuild((b) => void seen.push(b.kind)),
      onBeforeBuild(() => {
        throw new Error('boom')
      }),
      onAfterBuild(() => [problem('extra')]),
      onProblemFixes((p) => (p.rule === 'citation' ? [{ label: 'Add from Zotero', edits: [] }] : [])),
    ]
    const end = { kind: 'full', root: 'a.tex', result: { problems: [problem('citation')] } } as unknown as BuildEnd
    await runBeforeBuild(end)
    await runAfterBuild(end)
    expect(seen).toEqual(['full'])
    expect(end.result.problems.map((p) => p.rule)).toEqual(['citation', 'extra'])
    expect(end.result.problems[0].fixes.map((f) => f.label)).toEqual(['Add from Zotero'])
    for (const off of offs) off()
    const again = { kind: 'full', result: { problems: [] } } as unknown as BuildEnd
    await runAfterBuild(again)
    expect(again.result.problems).toEqual([])
  })
})

describe('Vault.savePlugin', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes plugin entries into .vault.json, keeping its other settings', async () => {
    dir = mkdtempSync(join(tmpdir(), 'plugins-'))
    writeFileSync(join(dir, '.vault.json'), JSON.stringify({ images: 'figs' }))
    const vault = new Vault(dir)
    await vault.load()
    await vault.savePlugin('demo', { enabled: true })
    let saved = JSON.parse(readFileSync(join(dir, '.vault.json'), 'utf8'))
    expect(saved).toMatchObject({ images: 'figs', plugins: { demo: true } })
    await vault.savePlugin('demo', { settings: { bank: 'Problems' } })
    saved = JSON.parse(readFileSync(join(dir, '.vault.json'), 'utf8'))
    expect(saved.plugins.demo).toEqual({ enabled: true, settings: { bank: 'Problems' } })
    await vault.savePlugin('demo', { enabled: null, settings: {} })
    saved = JSON.parse(readFileSync(join(dir, '.vault.json'), 'utf8'))
    expect(saved.plugins.demo).toEqual({ settings: { bank: 'Problems' } })
    const reread = new Vault(dir)
    await reread.load()
    expect(reread.plugins.demo).toEqual({ settings: { bank: 'Problems' } })
  })
})
