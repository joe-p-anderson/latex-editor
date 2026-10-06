import { describe, expect, it } from 'vitest'
import { badName, isInside, movedPath, splitExt, uniqueName } from '../src/shared/paths'

describe('movedPath', () => {
  const moves = [{ from: 'sec', to: 'body/sec' }, { from: 'a.tex', to: 'b.tex' }]
  it('follows files and folder prefixes', () => {
    expect(movedPath('a.tex', moves)).toBe('b.tex')
    expect(movedPath('sec/one.tex', moves)).toBe('body/sec/one.tex')
    expect(movedPath('sec', moves)).toBe('body/sec')
  })
  it("leaves others alone, including look-alike prefixes", () => {
    expect(movedPath('section/x.tex', moves)).toBeNull()
    expect(movedPath('a.texx', moves)).toBeNull()
  })
})
describe('names', () => {
  it('isInside', () => {
    expect(isInside('a/b', 'a')).toBe(true)
    expect(isInside('ab', 'a')).toBe(false)
    expect(isInside('a', 'a')).toBe(true)
  })
  it('splitExt / uniqueName', () => {
    expect(splitExt('a.tar.gz')).toEqual(['a.tar', '.gz'])
    expect(splitExt('.gitignore')).toEqual(['.gitignore', ''])
    expect(uniqueName('x.png', (n) => n === 'x.png' || n === 'x (2).png')).toBe('x (3).png')
  })
  it('badName', () => {
    expect(badName('ok.tex')).toBeNull()
    expect(badName('a/b')).not.toBeNull()
    expect(badName('  ')).not.toBeNull()
  })
})

import { dropText, relativeTo } from '../src/shared/paths'
describe('dropText', () => {
  const g = (p: string) => `GRAPHIC(${p})`
  it('writes paths relative to the open file', () => {
    expect(relativeTo('', 'a/b.tex')).toBe('a/b.tex')
    expect(relativeTo('sec', 'sec/b.tex')).toBe('b.tex')
    expect(relativeTo('sec/sub', 'img/x.png')).toBe('../../img/x.png')
  })
  it('chooses a command by file type', () => {
    expect(dropText(['sec/a.tex', 'Images/p.png', 'r.bib', 'x.csv'], '', true, false, g)).toBe(
      '\\input{sec/a}\nGRAPHIC(Images/p.png)\n\\bibliography{r}\nx.csv',
    )
    expect(dropText(['r.bib'], 'sec', true, true, g)).toBe('\\addbibresource{../r.bib}')
  })
  it('only inserts paths into other files', () => {
    expect(dropText(['a.tex'], '', false, false, g)).toBe('a.tex')
  })
})
