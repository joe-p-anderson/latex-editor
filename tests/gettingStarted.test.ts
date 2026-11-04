import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openCopy, replaceCopy } from '../src/main/gettingStarted'

let dir: string
let bundled: string
let target: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'endleaf-gs-'))
  bundled = join(dir, 'bundled')
  target = join(dir, 'Documents', 'endleaf', 'Getting started')
  mkdirSync(join(bundled, 'figures'), { recursive: true })
  writeFileSync(join(bundled, 'main.tex'), 'main\n')
  writeFileSync(join(bundled, '.vault.json'), '{}\n')
  writeFileSync(join(bundled, 'figures', 'plot.pdf'), 'pdf')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the Getting-started copy', () => {
  it('is made from the bundled vault the first time', async () => {
    expect(await openCopy(bundled, target)).toEqual({ fresh: true, changed: false })
    expect(readFileSync(join(target, 'main.tex'), 'utf8')).toBe('main\n')
    expect(readFileSync(join(target, '.vault.json'), 'utf8')).toBe('{}\n')
    expect(readFileSync(join(target, 'figures', 'plot.pdf'), 'utf8')).toBe('pdf')
  })

  it('is reopened as it is later, unchanged', async () => {
    await openCopy(bundled, target)
    expect(await openCopy(bundled, target)).toEqual({ fresh: false, changed: false })
  })

  it("doesn't count build products as a change", async () => {
    await openCopy(bundled, target)
    mkdirSync(join(target, '.texcache', 'main'), { recursive: true })
    writeFileSync(join(target, '.texcache', 'main', 'main.log'), 'log')
    expect(await openCopy(bundled, target)).toEqual({ fresh: false, changed: false })
  })

  it('keeps the student’s edits, and says it has changed', async () => {
    await openCopy(bundled, target)
    writeFileSync(join(target, 'main.tex'), 'edited\n')
    expect(await openCopy(bundled, target)).toEqual({ fresh: false, changed: true })
    expect(readFileSync(join(target, 'main.tex'), 'utf8')).toBe('edited\n')
  })

  it('has changed when a bundled file is gone', async () => {
    await openCopy(bundled, target)
    rmSync(join(target, 'figures', 'plot.pdf'))
    expect((await openCopy(bundled, target)).changed).toBe(true)
  })

  it('starts over by trashing the copy and making a fresh one', async () => {
    await openCopy(bundled, target)
    writeFileSync(join(target, 'main.tex'), 'edited\n')
    const trashed: string[] = []
    await replaceCopy(bundled, target, async (p) => {
      trashed.push(p)
      rmSync(p, { recursive: true })
    })
    expect(trashed).toEqual([target])
    expect(readFileSync(join(target, 'main.tex'), 'utf8')).toBe('main\n')
    expect(await openCopy(bundled, target)).toEqual({ fresh: false, changed: false })
  })

  it("leaves the copy alone when it can't be trashed", async () => {
    await openCopy(bundled, target)
    writeFileSync(join(target, 'main.tex'), 'edited\n')
    await expect(replaceCopy(bundled, target, async () => Promise.reject(new Error('no trash')))).rejects.toThrow('no trash')
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(join(target, 'main.tex'), 'utf8')).toBe('edited\n')
  })
})

describe('the bundled Getting-started vault', () => {
  const BUNDLED = join(import.meta.dirname, '../resources/getting-started')
  const read = (rel: string) => readFileSync(join(BUNDLED, rel), 'utf8')

  it('has the lab report, its Methods file, references and figure', () => {
    for (const rel of ['main.tex', 'methods.tex', 'references.bib', 'period.pdf', '.vault.json']) expect(existsSync(join(BUNDLED, rel)), rel).toBe(true)
    expect(read('main.tex')).toContain(String.raw`\input{methods}`)
    expect(read('main.tex')).toContain(String.raw`\includegraphics[width=\linewidth]{period.pdf}`)
  })

  it('fixes its look and its New file starter in .vault.json', () => {
    const settings = JSON.parse(read('.vault.json'))
    expect(settings.appearance.palette).toBe('bookbinders-blue')
    expect(settings.defaultStarter).toBe('Lab report (revtex)')
    expect(settings.papers).toEqual(['main.tex'])
  })

  it('is plain revtex, with nothing from a template folder', () => {
    expect(read('main.tex')).toMatch(/\\documentclass\[[^\]]*\]\{revtex4-2\}/)
    expect(read('main.tex') + read('methods.tex')).not.toMatch(/physicsinprogress|pip\.cls/)
  })

  it('has both deliberate slips: an undefined command, and units typed as maths beside \\qty', () => {
    expect(read('main.tex')).toContain(String.raw`\emhp{`)
    expect(read('main.tex')).toContain('$g = 9.8 m/s^2$')
    expect(read('main.tex')).toContain(String.raw`\qty{9.81}{m/s^2}`)
  })
})
