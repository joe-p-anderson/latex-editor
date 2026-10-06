import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyIn, createDir, createFile, hold, move, release, releaseAll, restore } from '../src/main/fileops'
import { Vault } from '../src/main/vault'

let dir: string
let vault: Vault
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fileops-'))
  vault = new Vault(dir, join(dir, '.global'))
  await vault.load()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const read = (rel: string) => readFileSync(join(dir, rel), 'utf8')

describe('create', () => {
  it('makes parent folders and refuses to overwrite', async () => {
    await createFile(vault, 'a/b/c.tex', 'hi')
    expect(read('a/b/c.tex')).toBe('hi')
    await expect(createFile(vault, 'a/b/c.tex', 'x')).rejects.toThrow(/already exists/)
    expect(read('a/b/c.tex')).toBe('hi')
  })
  it('creates folders once', async () => {
    await createDir(vault, 'x/y')
    await expect(createDir(vault, 'x/y')).rejects.toThrow(/already exists/)
  })
  it('refuses paths outside the vault', async () => {
    await expect(createFile(vault, '../evil.tex', '')).rejects.toThrow(/Outside vault/)
  })
})

describe('move', () => {
  it('moves files and folders', async () => {
    await createFile(vault, 'sec/one.tex', '1')
    await createFile(vault, 'two.tex', '2')
    mkdirSync(join(dir, 'dest'))
    await move(vault, [{ from: 'sec', to: 'dest/sec' }, { from: 'two.tex', to: 'dest/two.tex' }])
    expect(read('dest/sec/one.tex')).toBe('1')
    expect(read('dest/two.tex')).toBe('2')
    expect(existsSync(join(dir, 'sec'))).toBe(false)
  })
  it('checks every target before moving anything', async () => {
    await createFile(vault, 'a.tex', 'a')
    await createFile(vault, 'b.tex', 'b')
    await createFile(vault, 'd/b.tex', 'taken')
    await expect(move(vault, [{ from: 'a.tex', to: 'd/a.tex' }, { from: 'b.tex', to: 'd/b.tex' }])).rejects.toThrow(/already exists/)
    expect(existsSync(join(dir, 'a.tex'))).toBe(true)
  })
  it('refuses to move a folder into itself', async () => {
    mkdirSync(join(dir, 'f'))
    await expect(move(vault, [{ from: 'f', to: 'f/g' }])).rejects.toThrow(/into itself/)
  })
})

describe('copyIn', () => {
  it('copies files and folders, suffixing clashes', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'outside-'))
    try {
      writeFileSync(join(outside, 'fig.png'), 'png')
      mkdirSync(join(outside, 'folder'))
      writeFileSync(join(outside, 'folder', 'x.txt'), 'x')
      await createFile(vault, 'Images/fig.png', 'old')
      const rels = await copyIn(vault, [join(outside, 'fig.png'), join(outside, 'folder')], 'Images')
      expect(rels).toEqual(['Images/fig (2).png', 'Images/folder'])
      expect(read('Images/fig (2).png')).toBe('png')
      expect(read('Images/folder/x.txt')).toBe('x')
      expect(read('Images/fig.png')).toBe('old')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('hold / restore / release', () => {
  it('puts a deleted file back', async () => {
    await createFile(vault, 'd/a.tex', 'a')
    await createFile(vault, 'b.tex', 'b')
    const token = await hold(vault, ['d', 'b.tex'])
    expect(existsSync(join(dir, 'd'))).toBe(false)
    expect(await restore(vault, token)).toEqual(['d', 'b.tex'])
    expect(read('d/a.tex')).toBe('a')
    expect(read('b.tex')).toBe('b')
  })
  it('fails to restore over a reused path', async () => {
    await createFile(vault, 'a.tex', 'a')
    const token = await hold(vault, ['a.tex'])
    await createFile(vault, 'a.tex', 'new')
    await expect(restore(vault, token)).rejects.toThrow(/already exists/)
    expect(read('a.tex')).toBe('new')
  })
  it('release trashes the held items', async () => {
    await createFile(vault, 'a.tex', 'a')
    const trashed: string[] = []
    const token = await hold(vault, ['a.tex'])
    await release(vault, token, async (abs) => void trashed.push(abs))
    expect(trashed).toHaveLength(1)
    expect(trashed[0]).toMatch(/a\.tex$/)
    await expect(restore(vault, token)).rejects.toThrow()
  })
  it('releaseAll clears leftovers', async () => {
    await createFile(vault, 'a.tex', 'a')
    await hold(vault, ['a.tex'])
    const trashed: string[] = []
    await releaseAll(vault, async (abs) => void trashed.push(abs))
    expect(trashed).toHaveLength(1)
  })
})
