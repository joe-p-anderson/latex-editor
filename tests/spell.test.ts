// The spellchecker against the real en-US dictionary and a vault word list.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addWord, misspelled, reloadWords, suggestions } from '../src/main/spell'
import { Vault } from '../src/main/vault'

const dir = mkdtempSync(join(tmpdir(), 'spell-'))
let vault: Vault
beforeAll(async () => {
  writeFileSync(join(dir, 'words.txt'), '# course words\nPhET\n')
  vault = new Vault(dir)
  await vault.load()
}, 30_000)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('spellcheck', () => {
  it('flags misspellings and knows physics words and the vault list', async () => {
    expect(await misspelled(vault, ['teh', 'kinematics', 'velocity', 'Velocity', 'PhET', 'Hotwheels'])).toEqual(['teh', 'Hotwheels'])
  }, 30_000)

  it('suggests corrections', async () => {
    expect(await suggestions(vault, 'velocty')).toContain('velocity')
  })

  it('adds words to the vault list, sorted under its comments', async () => {
    await addWord(vault, 'Hotwheels')
    expect(await misspelled(vault, ['Hotwheels'])).toEqual([])
    expect(readFileSync(join(dir, 'words.txt'), 'utf8')).toBe('# course words\nHotwheels\nPhET\n')
  })

  it('forgets words removed from the list on reload', async () => {
    writeFileSync(join(dir, 'words.txt'), 'PhET\n')
    await reloadWords(vault)
    expect(await misspelled(vault, ['Hotwheels', 'PhET'])).toEqual(['Hotwheels'])
  })
})
