import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importImage, saveImage } from '../src/main/images'
import { Vault } from '../src/main/vault'
import { fuzzyFilter, includegraphicsArgAt, isImage, safeFileName } from '../src/shared/images'

describe('fuzzyFilter', () => {
  const paths = ['Images/mirror.png', 'Images/mirrorproblem.pdf', 'Images/law of cosines.pdf', 'Images/lensFocus.png', 'Assets/Logo.pdf']
  it('ranks the best match first', () => {
    expect(fuzzyFilter('mir', paths)[0]).toBe('Images/mirror.png')
    expect(fuzzyFilter('cos', paths)).toEqual(['Images/law of cosines.pdf'])
  })
  it('matches characters in order across words', () => {
    expect(fuzzyFilter('lfoc', paths)).toEqual(['Images/lensFocus.png'])
  })
  it('matches file names, not the shared folder prefix, unless the query has a /', () => {
    // "img" is in every "Images/..." path, but in no file name.
    expect(fuzzyFilter('img', paths)).toEqual([])
    expect(fuzzyFilter('Assets/', paths)).toEqual(['Assets/Logo.pdf'])
  })
  it('returns everything for an empty query', () => {
    expect(fuzzyFilter('', paths)).toHaveLength(paths.length)
  })
})

describe('includegraphicsArgAt', () => {
  const line = 'x \\includegraphics[width=2in]{Images/mirror.png} y'
  it('finds the path argument around the cursor', () => {
    const start = line.indexOf('Images')
    expect(includegraphicsArgAt(line, start + 3)).toEqual({ from: start, to: start + 'Images/mirror.png'.length, text: 'Images/mirror.png' })
  })
  it('works while the argument is still being typed', () => {
    const typing = '\\includegraphics{Ima'
    expect(includegraphicsArgAt(typing, typing.length)?.text).toBe('Ima')
  })
  it('does not run into the next command when the brace is not closed yet', () => {
    const typing = '\\includegraphics{lens\\documentclass{handout}'
    expect(includegraphicsArgAt(typing, 21)).toEqual({ from: 17, to: 21, text: 'lens' })
  })
  it('ignores positions outside the argument', () => {
    expect(includegraphicsArgAt(line, 0)).toBeNull()
  })
})

describe('safeFileName', () => {
  it('replaces spaces and TeX-special characters', () => {
    expect(safeFileName('law of cosines.PDF')).toBe('law_of_cosines.pdf')
    expect(safeFileName('50% #1 {draft}.png')).toBe('50_1_draft.png')
  })
})

describe('importImage / saveImage', () => {
  let dir: string
  let vault: Vault
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'latex-editor-images-'))
    vault = new Vault(join(dir, 'vault'))
    writeFileSync(join(dir, 'outside picture.png'), png)
    await import('node:fs/promises').then((fs) => fs.mkdir(join(dir, 'vault', 'Assets'), { recursive: true }))
    await vault.load()
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it("uses the vault's existing image folder", () => {
    expect(vault.imagesDir).toBe('Assets')
  })
  it('copies an outside image in under a LaTeX-safe name', async () => {
    expect(await importImage(vault, join(dir, 'outside picture.png'))).toBe('Assets/outside_picture.png')
    expect(readFileSync(join(dir, 'vault/Assets/outside_picture.png'))).toEqual(Buffer.from(png))
  })
  it('reuses an identical file instead of duplicating it', async () => {
    expect(await importImage(vault, join(dir, 'outside picture.png'))).toBe('Assets/outside_picture.png')
    expect(readdirSync(join(dir, 'vault/Assets'))).toEqual(['outside_picture.png'])
  })
  it('picks a new name when a different file has the same name', async () => {
    expect(await saveImage(vault, 'outside picture.png', new Uint8Array([9, 9]))).toBe('Assets/outside_picture-1.png')
  })
  it('returns the path of an image already in the vault without copying', async () => {
    expect(await importImage(vault, join(dir, 'vault/Assets/outside_picture.png'))).toBe('Assets/outside_picture.png')
  })
  it('refuses non-images', async () => {
    expect(isImage('notes.txt')).toBe(false)
    await expect(saveImage(vault, 'notes.txt', new Uint8Array([1]))).rejects.toThrow(/Not an image/)
  })
})
