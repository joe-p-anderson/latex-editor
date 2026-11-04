import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { holdsTex, makeVault, newVaultChoices } from '../src/main/newvault'
import { Vault } from '../src/main/vault'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const temp = () => (dir = mkdtempSync(join(tmpdir(), 'newvault-')))

describe('holdsTex', () => {
  it('is false for an empty or missing folder', async () => {
    temp()
    expect(await holdsTex(dir)).toBe(false)
    expect(await holdsTex(join(dir, 'not-made-yet'))).toBe(false)
  })

  it('finds a .tex file at the top or in a subfolder', async () => {
    temp()
    writeFileSync(join(dir, 'notes.md'), '')
    expect(await holdsTex(dir)).toBe(false)
    mkdirSync(join(dir, 'week1'))
    writeFileSync(join(dir, 'week1', 'Lecture.TEX'), '')
    expect(await holdsTex(dir)).toBe(true)
  })

  it('ignores build and tool folders', async () => {
    temp()
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'x', 'a.tex'), '')
    expect(await holdsTex(dir)).toBe(false)
  })
})

describe('newVaultChoices', () => {
  it("offers the .tex starters, preselecting the app's default, and names the vault after its folder", async () => {
    temp()
    const root = join(dir, 'PHYS 101')
    const c = await newVaultChoices(root, join(dir, 'global'), 'Article')
    expect(c.name).toBe('PHYS 101')
    expect(c.starters.every((s) => s.ext === '.tex')).toBe(true)
    expect(c.starters.map((s) => s.name)).toContain('Lab report (revtex)')
    expect(c.starters.find((s) => s.id === c.preselect)?.name).toBe('Article')
    expect(existsSync(root)).toBe(false) // nothing written yet
  })
})

describe('makeVault', () => {
  it('writes .vault.json, main.tex, references.bib and figures/ from the lab report', async () => {
    temp()
    const root = join(dir, 'lab')
    const global = join(dir, 'global')
    const { starters } = await newVaultChoices(root, global, 'Lab report (revtex)')
    const lab = starters.find((s) => s.name === 'Lab report (revtex)')!
    const main = await makeVault(root, { name: 'Pendulum lab', starter: lab.id }, global)
    expect(main).toBe('main.tex')
    expect(readdirSync(root).sort()).toEqual(['.vault.json', 'figures', 'main.tex', 'references.bib'])
    expect(readdirSync(join(root, 'figures'))).toEqual([])
    const tex = readFileSync(join(root, 'main.tex'), 'utf8')
    expect(tex).toContain('\\documentclass[reprint,aps]{revtex4-2}')
    expect(tex).toContain('\\title{Pendulum lab}')
    expect(tex).not.toContain('{{')
    expect(tex).not.toContain('%% starter:')
    expect(tex).toContain('\\includegraphics')
    const settings = JSON.parse(readFileSync(join(root, '.vault.json'), 'utf8'))
    expect(settings).toMatchObject({ name: 'Pendulum lab', defaultStarter: 'Lab report (revtex)' })
    expect(typeof settings.appearance?.palette).toBe('string')
  })

  it('makes an Article vault whose default starter is Article', async () => {
    temp()
    const root = join(dir, 'essay')
    const global = join(dir, 'global')
    const { starters } = await newVaultChoices(root, global, 'Lab report (revtex)')
    const article = starters.find((s) => s.name === 'Article')!
    await makeVault(root, { name: 'essay', starter: article.id }, global)
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toContain('\\documentclass{article}')
    expect(existsSync(join(root, 'references.bib'))).toBe(false)
    const v = new Vault(root)
    await v.load()
    expect(v.defaultStarter).toBe('Article')
    expect(v.name).toBe('essay')
  })

  it('keeps a references.bib already in the folder', async () => {
    temp()
    const root = join(dir, 'lab')
    mkdirSync(root)
    writeFileSync(join(root, 'references.bib'), 'mine')
    const { starters } = await newVaultChoices(root, null, 'Lab report (revtex)')
    await makeVault(root, { name: 'lab', starter: starters.find((s) => s.name === 'Lab report (revtex)')!.id }, null)
    expect(readFileSync(join(root, 'references.bib'), 'utf8')).toBe('mine')
  })

  it("opens a folder starter's entry file as main.tex, and fills a field in every file", async () => {
    temp()
    const root = join(dir, 'notes')
    const global = join(dir, 'global')
    mkdirSync(join(global, 'starters', 'Notes', 'parts'), { recursive: true })
    writeFileSync(join(global, 'starters', 'Notes', 'notes.tex'), '%% starter: Notes\n\\title{{{Title}}}\n')
    writeFileSync(join(global, 'starters', 'Notes', 'parts', 'one.tex'), '% part of {{Title}}, in {{filename}}\n')
    const { starters } = await newVaultChoices(root, global, 'Notes')
    await makeVault(root, { name: 'Optics', starter: starters.find((s) => s.name === 'Notes')!.id }, global)
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('\\title{Optics}\n')
    expect(readFileSync(join(root, 'parts', 'one.tex'), 'utf8')).toBe('% part of Optics, in main.tex\n')
    expect(existsSync(join(root, 'notes.tex'))).toBe(false)
  })

  it('refuses a starter it does not know', async () => {
    temp()
    await expect(makeVault(join(dir, 'x'), { name: 'x', starter: 'nope' }, null)).rejects.toThrow()
  })
})
