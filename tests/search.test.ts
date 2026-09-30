import { describe, expect, it } from 'vitest'
import { applyChanges, compileQuery, keyAt, renameKeyChanges, replacementChanges, searchText, type SearchOptions } from '../src/shared/search'

const PLAIN: SearchOptions = { regex: false, caseSensitive: false, wholeWord: false, includeComments: true }
const texts = (text: string, q: string, o: Partial<SearchOptions> = {}) => searchText(text, q, { ...PLAIN, ...o }).map((m) => m.text)

describe('searchText', () => {
  it('finds literal text, ignoring case by default', () => {
    expect(texts('Vec \\vec{v} VEC', 'vec')).toEqual(['Vec', 'vec', 'VEC'])
    expect(texts('Vec \\vec{v} VEC', 'vec', { caseSensitive: true })).toEqual(['vec'])
  })

  it('treats regex characters literally unless asked', () => {
    expect(texts('a.b axb', 'a.b')).toEqual(['a.b'])
    expect(texts('a.b axb', 'a.b', { regex: true })).toEqual(['a.b', 'axb'])
  })

  it('matches whole words, even for commands', () => {
    expect(texts('\\vec{a} \\vector{b} x\\vec', '\\vec', { wholeWord: true })).toEqual(['\\vec', '\\vec'])
    expect(texts('cat concat cat5 cat', 'cat', { wholeWord: true })).toEqual(['cat', 'cat'])
  })

  it('skips comments on request, but not escaped percent signs', () => {
    const src = 'mass 5\\% mass % mass\n% mass\nmass'
    expect(searchText(src, 'mass', { ...PLAIN, includeComments: false }).map((m) => m.line)).toEqual([1, 1, 3])
    expect(texts(src, 'mass')).toHaveLength(5)
  })

  it('counts offsets and lines in \\n text, whatever the line endings', () => {
    const [m] = searchText('one\r\ntwo\r\nthree', 'three', PLAIN)
    expect(m).toMatchObject({ from: 8, to: 13, line: 3, before: '', text: 'three' })
  })

  it('reports a bad regex instead of throwing', () => {
    expect(typeof compileQuery('(', { ...PLAIN, regex: true })).toBe('string')
    expect(searchText('(', '(', { ...PLAIN, regex: true })).toEqual([])
  })

  it('stops at the limit and survives empty matches', () => {
    expect(searchText('aaaa', 'a', PLAIN, 2)).toHaveLength(2)
    expect(texts('ab', 'x*', { regex: true })).toEqual([])
  })
})

describe('replace', () => {
  it('replaces literally in a plain search', () => {
    const src = 'a $1 a'
    const out = applyChanges(src, replacementChanges(searchText(src, 'a', PLAIN), '$1'))
    expect(out).toBe('$1 $1 $1')
  })

  it('expands groups in a regex search', () => {
    const src = '\\textbf{x} and \\textbf{y}'
    const ms = searchText(src, String.raw`\\textbf\{(\w)\}`, { ...PLAIN, regex: true })
    expect(applyChanges(src, replacementChanges(ms, '\\emph{$1}$$'))).toBe('\\emph{x}$ and \\emph{y}$')
  })
})

describe('label keys', () => {
  const src = [
    '\\section{Intro}\\label{sec:intro}',
    'See \\ref{sec:intro}, \\cref{fig:a, sec:intro} and \\eqref{eq:1}.',
    '\\hyperref[sec:intro]{here}, \\crefrange{sec:intro}{sec:end}, \\ref{sec:introduction}',
  ].join('\n')

  it('renames the label and every reference, including lists and ranges', () => {
    const out = applyChanges(src, renameKeyChanges(src, 'sec:intro', 'sec:start'))
    expect(out).toBe(
      [
        '\\section{Intro}\\label{sec:start}',
        'See \\ref{sec:start}, \\cref{fig:a, sec:start} and \\eqref{eq:1}.',
        '\\hyperref[sec:start]{here}, \\crefrange{sec:start}{sec:end}, \\ref{sec:introduction}',
      ].join('\n'),
    )
  })

  it('finds the key under the cursor', () => {
    expect(keyAt(src, src.indexOf('sec:intro') + 3)).toBe('sec:intro')
    expect(keyAt(src, src.indexOf('fig:a') + 5)).toBe('fig:a')
    expect(keyAt(src, src.indexOf('eq:1'))).toBe('eq:1')
    expect(keyAt(src, src.indexOf('See'))).toBeNull()
  })
})
