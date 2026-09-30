import { describe, expect, it } from 'vitest'
import { leftRightPairs, pairContext, pairOnBackspace, pairOnInput, type PairContext, type PairEdit } from '../src/shared/pairs'

const MATH: PairContext = { math: true, text: false }
const TEXT: PairContext = { math: false, text: true }
const RAW: PairContext = { math: false, text: false }

/** Types `ch` at | in `marked`; returns the result with the new cursor marked, or null for a plain keystroke. */
function type(marked: string, ch: string, ctx: PairContext): string | null {
  const at = marked.indexOf('|')
  const text = marked.replace('|', '')
  const e = pairOnInput(text.slice(0, at), text.slice(at), ch, ctx)
  return e && applyAt(text, at, e)
}
function backspace(marked: string): string | null {
  const at = marked.indexOf('|')
  const text = marked.replace('|', '')
  const e = pairOnBackspace(text.slice(0, at), text.slice(at))
  return e && applyAt(text, at, e)
}
function applyAt(text: string, at: number, e: PairEdit): string {
  const out = text.slice(0, at + e.from) + e.insert + text.slice(at + e.to)
  const cur = at + e.from + e.cursor
  return out.slice(0, cur) + '|' + out.slice(cur)
}

describe('\\left pairs', () => {
  it('adds the matching \\right', () => {
    expect(type('\\left|', '(', MATH)).toBe('\\left(|\\right)')
    expect(type('\\left|', '[', MATH)).toBe('\\left[|\\right]')
    expect(type('\\left|', '.', MATH)).toBe('\\left.|\\right.')
    expect(type('\\left\\|', '{', MATH)).toBe('\\left\\{|\\right\\}')
    expect(type('\\left\\langl|', 'e', MATH)).toBe('\\left\\langle|\\right\\rangle')
  })
  it('waits for a letter delimiter to be complete', () => expect(type('\\left\\lang|', 'l', MATH)).toBeNull())
  it('only in math', () => expect(type('\\left|', '(', TEXT)).toBeNull())
  it('steps over an added \\right)', () => expect(type('\\left(x|\\right)', ')', MATH)).toBe('\\left(x\\right)|'))
  it('pairs \\langle on its own', () => expect(type('\\langl|', 'e', MATH)).toBe('\\langle|\\rangle'))
})

describe('escaped pairs', () => {
  it('\\{ adds \\}', () => {
    expect(type('\\|', '{', MATH)).toBe('\\{|\\}')
    expect(type('\\|', '{', TEXT)).toBe('\\{|\\}')
  })
  it('a line break then a group is not \\{', () => expect(type('\\\\|', '{', TEXT)).toBeNull())
  it('\\( and \\[ in text', () => {
    expect(type('see \\|', '(', TEXT)).toBe('see \\(|\\)')
    expect(type('\\|', '[', TEXT)).toBe('\\[|\\]')
  })
})

describe('quotes', () => {
  it('`` adds a closing pair', () => expect(type('say `|', '`', TEXT)).toBe("say ``|''"))
  it("'' steps over the added one", () => expect(type("``hi'|''", "'", TEXT)).toBe("``hi''|"))
  it('an apostrophe inside is typed normally', () => expect(type("``don|''", "'", TEXT)).toBeNull())
  it('smart quotes open and close by position', () => {
    expect(type('He said |', '"', TEXT)).toBe('He said ``|')
    expect(type('|', '"', TEXT)).toBe('``|')
    expect(type('(|', '"', TEXT)).toBe('(``|')
    expect(type('``yes|', '"', TEXT)).toBe("``yes''|")
  })
  it('leaves " alone outside prose and as an accent', () => {
    expect(type('x |', '"', MATH)).toBeNull()
    expect(type('\\href{|', '"', RAW)).toBeNull()
    expect(type('G\\|', '"', TEXT)).toBeNull()
  })
})

describe('backspace', () => {
  it('removes both halves of an empty pair', () => {
    expect(backspace('\\left(|\\right)')).toBe('|')
    expect(backspace('a \\left\\langle|\\right\\rangle b')).toBe('a | b')
    expect(backspace('\\{|\\}')).toBe('|')
    expect(backspace("``|''")).toBe('|')
    expect(backspace('\\(|\\)')).toBe('|')
  })
  it('leaves non-empty or unpaired alone', () => {
    expect(backspace('\\left(x|\\right)')).toBeNull()
    expect(backspace('\\\\{|\\}')).toBeNull()
    expect(backspace('(|')).toBeNull()
  })
})

describe('pairContext', () => {
  const doc = '\\documentclass{a}\n\\begin{document}\nText $x$ \\label{a} % c\n\\begin{verbatim}\nv\n\\end{verbatim}\n\\end{document}'
  const at = (s: string, off = 0) => pairContext(doc, doc.indexOf(s) + off)
  it('knows math, prose and the rest', () => {
    expect(at('Text')).toEqual({ math: false, text: true })
    expect(at('x$', 0)).toEqual({ math: true, text: false })
    expect(at('a}', 0).text).toBe(false) // \label{…}
    expect(at(' c').text).toBe(false) // comment
    expect(at('{a}').text).toBe(false) // preamble
    expect(at('v\n').text).toBe(false) // verbatim
  })
  it('treats the rest of a paragraph after an open $ as math, and the next paragraph as text', () => {
    const src = 'a $x + \n\nb'
    expect(pairContext(src, 'a $x + '.length).math).toBe(true)
    expect(pairContext(src, src.length)).toEqual({ math: false, text: true })
  })
})

describe('leftRightPairs', () => {
  it('matches nested pairs and skips comments', () => {
    const src = '\\left( a \\left[ b \\right] % \\left(\n\\right)'
    const pairs = leftRightPairs(src)
    const s = (r: { from: number; to: number }) => src.slice(r.from, r.to)
    expect(pairs.map((p) => [s(p.open), s(p.close)])).toEqual([
      ['\\left[', '\\right]'],
      ['\\left(', '\\right)'],
    ])
  })
})
