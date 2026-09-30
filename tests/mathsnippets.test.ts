import { describe, expect, it } from 'vitest'
import {
  BUILTIN_MATH_SNIPPETS,
  inMathTextArg,
  matchAt,
  mathSnippetsFileTemplate,
  mergeSnippets,
  parseMathSnippets,
  toCodeMirrorTemplate,
} from '../src/shared/mathsnippets'

/** What typing the last character of `before` expands to: the text before the cursor afterwards (tab stops as-is). */
function expand(before: string, snippets = BUILTIN_MATH_SNIPPETS): string | null {
  const m = matchAt(before, snippets)
  return m && before.slice(0, before.length - m.length) + m.template
}

describe('built-in shortcuts', () => {
  it('parse without errors', () => {
    expect(parseMathSnippets(mathSnippetsFileTemplate()).errors).toEqual([])
    expect(BUILTIN_MATH_SNIPPETS.length).toBeGreaterThan(60)
  })

  it('expand Greek, fractions, relations', () => {
    expect(expand('x = @w')).toBe('x = \\omega')
    expect(expand('@D')).toBe('\\Delta')
    expect(expand('@ve')).toBe('\\varepsilon')
    expect(expand('a //')).toBe('a \\frac{$1}{$2}$0')
    expect(expand('x ->')).toBe('x \\to')
    expect(expand('a <=')).toBe('a \\leq')
    expect(expand('a ...')).toBe('a \\dots')
    expect(expand('v sr')).toBe('v ^{2}')
  })

  it('turns a letter and an accent into the accent on the letter', () => {
    expect(expand('xhat')).toBe('\\hat{x}')
    expect(expand('+ vvec')).toBe('+ \\vec{v}')
    expect(expand('xddot')).toBe('\\ddot{x}')
    expect(expand('xdot')).toBe('\\dot{x}')
    expect(expand('hat')).toBe('\\hat{$1}$0')
  })

  it('never fires inside a command being typed', () => {
    expect(expand('\\sqrt')).toBeNull()
    expect(expand('\\sq')).toBeNull()
    expect(expand('\\sum')).toBeNull()
    expect(expand('\\ddot')).toBeNull()
    expect(expand('\\cdot')).toBeNull()
    expect(expand('\\hat')).toBeNull()
    expect(expand('\\partial')).toBeNull()
    expect(expand('\\par')).toBeNull()
  })

  it('needs a word start for letter triggers', () => {
    expect(expand('asr')).toBeNull()
    expect(expand('max')).toBeNull()
  })

  it('makes subscripts', () => {
    expect(expand('x1')).toBe('x_1')
    expect(expand('v_0 + x_12')).toBe('v_0 + x_{12}')
    expect(expand('3e2')).toBeNull()
    expect(expand('\\alpha2')).toBeNull()
    expect(expand('ab1')).toBeNull()
  })
})

describe('vault file', () => {
  it('overrides, disables and adds', () => {
    const user = parseMathSnippets('# mine\nvv => \\vec{$1}$0\n!xx\nsr => ^2\nbad line\n/(/ => x')
    expect(user.errors.map((e) => e.line)).toEqual([5, 6])
    const all = mergeSnippets(BUILTIN_MATH_SNIPPETS, user)
    expect(expand('vv', all)).toBe('\\vec{$1}$0')
    expect(expand('a xx', all)).toBeNull()
    expect(expand('v sr', all)).toBe('v ^2')
  })

  it('handles a trigger that is also the separator', () => {
    const { snippets } = parseMathSnippets('=> => \\Rightarrow')
    expect(snippets[0]).toMatchObject({ trigger: '=>', replacement: '\\Rightarrow' })
  })
})

describe('inMathTextArg', () => {
  const at = (s: string) => {
    const pos = s.indexOf('|')
    return inMathTextArg(s.replace('|', ''), pos, 0)
  }
  it('knows text, labels and units', () => {
    expect(at('$x \\text{for x|}$')).toBe(true)
    expect(at('\\begin{equation}\\label{eq:x|}')).toBe(true)
    expect(at('$\\qty{9.8}{m/s|}$')).toBe(true)
    expect(at('$\\frac{x|}{2}$')).toBe(false)
    expect(at('$\\text{a} x|$')).toBe(false)
  })
})

it('writes CodeMirror tab stops', () => {
  expect(toCodeMirrorTemplate('\\frac{$1}{$2}$0')).toBe('\\frac{${1}}{${2}}${99}')
})
