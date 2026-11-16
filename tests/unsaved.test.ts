import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UnsavedStore } from '../src/main/unsaved'

let dir: string
let store: UnsavedStore
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unsaved-'))
  store = new UnsavedStore(join(dir, 'unsaved'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('UnsavedStore', () => {
  it('reads back what was written, per vault', async () => {
    await store.write('C:\\vaults\\a', { 'main.tex': 'one' })
    await store.write('C:\\vaults\\b', { 'x.tex': 'two' })
    expect(await store.read('C:\\vaults\\a')).toEqual({ 'main.tex': 'one' })
    expect(await store.read('C:\\Vaults\\B')).toEqual({ 'x.tex': 'two' })
    expect(await store.read('C:\\vaults\\c')).toEqual({})
  })

  it('removes the copy when nothing is unsaved', async () => {
    await store.write('/v', { 'main.tex': 'one' })
    await store.write('/v', {})
    expect(await store.read('/v')).toEqual({})
    expect(readdirSync(join(dir, 'unsaved'))).toEqual([])
  })

  it('keeps the last of several quick writes', async () => {
    const writes = ['a', 'b', 'c', 'd'].map((t) => store.write('/v', { 'main.tex': t }))
    await Promise.all(writes)
    expect(await store.read('/v')).toEqual({ 'main.tex': 'd' })
  })

  it('treats a damaged copy as none', async () => {
    await store.write('/v', { 'main.tex': 'one' })
    const [file] = readdirSync(join(dir, 'unsaved'))
    writeFileSync(join(dir, 'unsaved', file), '{not json')
    expect(await store.read('/v')).toEqual({})
  })

  it('clearing a vault with no copy does nothing', async () => {
    await store.write('/v', {})
    expect(existsSync(join(dir, 'unsaved'))).toBe(false)
  })
})
