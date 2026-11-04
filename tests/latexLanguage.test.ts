// Source view's three syntax roles (.scratch/ux-fixes/spec.md, "Syntax
// roles"): which role the LaTeX highlighter gives each piece of source.
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'
import { latex, roles } from '../src/renderer/src/lib/latexLanguage'

const names = tagHighlighter([
  { tag: roles.command, class: 'command' },
  { tag: roles.structure, class: 'structure' },
  { tag: roles.math, class: 'math' },
  { tag: [t.bracket, t.brace], class: 'bracket' },
  { tag: t.comment, class: 'comment' },
])

/** The role of each character of `doc` ('' where it has none). */
function rolesOf(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [latex] })
  const tree = ensureSyntaxTree(state, doc.length, 5000)!
  const out: string[] = Array(doc.length).fill('')
  highlightTree(tree, names, (from, to, cls) => out.fill(cls, from, to))
  return out
}
/** The role of the `nth` occurrence of `text` in `doc`; '' if none, 'mixed' if its characters differ. */
function roleOf(doc: string, text: string, nth = 0): string {
  let at = -1
  for (let i = 0; i <= nth; i++) at = doc.indexOf(text, at + 1)
  if (at < 0) throw new Error(`no ${text} in ${doc}`)
  const r = new Set(rolesOf(doc).slice(at, at + text.length))
  return r.size === 1 ? [...r][0] : 'mixed'
}

describe('LaTeX syntax roles', () => {
  it('gives commands the command role', () => {
    expect(roleOf(String.raw`\section{Intro}`, String.raw`\section`)).toBe('command')
    expect(roleOf(String.raw`\frac{a}{b}`, String.raw`\frac`)).toBe('command')
  })

  it('gives environment names and label, ref and cite keys the structure role', () => {
    const doc = String.raw`\begin{align}` + '\nx\n' + String.raw`\end{align}`
    expect(roleOf(doc, String.raw`\begin`)).toBe('command')
    expect(roleOf(doc, 'align', 0)).toBe('structure')
    expect(roleOf(doc, 'align', 1)).toBe('structure')
    expect(roleOf(String.raw`see \ref{fig-one}`, 'fig-one')).toBe('structure')
    expect(roleOf(String.raw`\label{eq:2}`, 'eq:2')).toBe('structure')
    expect(roleOf(String.raw`\cite{knuth84}`, 'knuth84')).toBe('structure')
  })

  it('gives the inside of inline maths the maths role, but its commands stay commands', () => {
    const doc = String.raw`so $\alpha + x^2$ holds`
    expect(roleOf(doc, String.raw`\alpha`)).toBe('command')
    expect(roleOf(doc, 'x^2')).toBe('math')
    expect(roleOf(doc, '+')).toBe('math')
    expect(roleOf(doc, '$', 0)).toBe('math')
    expect(roleOf(doc, '$', 1)).toBe('math')
    expect(roleOf(doc, 'holds')).toBe('')
  })

  it('gives display maths and maths environments the maths role', () => {
    expect(roleOf(String.raw`\[ y = 3 \]`, 'y')).toBe('math')
    const doc = String.raw`\begin{equation}` + '\n  y = ' + String.raw`\beta 3` + '\n' + String.raw`\end{equation}` + '\nafter 3 words'
    expect(roleOf(doc, 'y')).toBe('math')
    expect(roleOf(doc, String.raw`\beta`)).toBe('command')
    expect(roleOf(doc, '3', 0)).toBe('math')
    expect(roleOf(doc, '3', 1)).toBe('')
    expect(roleOf(doc, 'after')).toBe('')
  })

  it('keeps braces as brackets and comments as comments', () => {
    const doc = String.raw`\textbf{bold} % note`
    expect(roleOf(doc, '{')).toBe('bracket')
    expect(roleOf(doc, '}')).toBe('bracket')
    expect(roleOf(doc, '% note')).toBe('comment')
  })

  it('leaves plain prose, and numbers in it, unhighlighted', () => {
    expect(rolesOf('I ate 3 apples.').every((r) => r === '')).toBe(true)
  })
})
