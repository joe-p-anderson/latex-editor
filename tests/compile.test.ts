import { describe, expect, it } from 'vitest'
import { formatDeps, preambleHash, preambleOf } from '../src/main/preamble'
import { unshadow } from '../src/main/shadow'

describe('preambleOf', () => {
  it('is the text up to and including \\begin{document}', () => {
    const doc = '\\documentclass{article}\r\n\\usepackage{x}\r\n\\begin{document}\r\nHi\r\n\\end{document}'
    expect(preambleOf(doc)).toBe('\\documentclass{article}\n\\usepackage{x}\n\\begin{document}')
  })

  it('skips a commented-out \\begin{document}', () => {
    expect(preambleOf('% \\begin{document}\n\\documentclass{a}\n  \\begin{document}')).toBe('% \\begin{document}\n\\documentclass{a}\n  \\begin{document}')
    expect(preambleOf('\\input{chapter}')).toBeNull()
  })

  it('hashes line endings the same', () => {
    expect(preambleHash(preambleOf('a\r\n\\begin{document}')!)).toBe(preambleHash(preambleOf('a\n\\begin{document}')!))
  })
})

describe('formatDeps', () => {
  const fls = [
    'PWD C:\\v',
    'INPUT C:\\Program Files\\MiKTeX\\tex\\latex\\base\\article.cls',
    'INPUT C:\\tpl\\handout.cls',
    'INPUT ./macros.tex',
    'INPUT C:\\v\\.texcache\\doc\\doc.aux',
    'OUTPUT doc.fmt',
  ].join('\r\n')

  it('keeps only files in the vault and template libraries, never the cache', () => {
    expect(formatDeps(fls, 'C:\\v', ['C:\\v', 'C:\\tpl']).map((p) => p.toLowerCase())).toEqual(['c:\\tpl\\handout.cls', 'c:\\v\\macros.tex'])
  })
})

describe('unshadow', () => {
  it('turns shadow-folder paths back into vault paths', () => {
    expect(unshadow('C:/v/.texcache/.shadow/17907188191520/Homework/HW3.tex:12: Undefined')).toBe('C:/v/Homework/HW3.tex:12: Undefined')
    expect(unshadow('(C:\\v\\.texcache\\.shadow\\42\\a b\\x.tex')).toBe('(C:\\v\\a b\\x.tex')
    expect(unshadow('C:/v/.texcache/Homework/HW3/HW3.aux')).toBe('C:/v/.texcache/Homework/HW3/HW3.aux')
  })
})
