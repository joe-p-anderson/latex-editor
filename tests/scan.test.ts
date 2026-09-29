import { describe, expect, it } from 'vitest'
import { scanBraces, scanEnvironments, scanMath, scanParagraphBraces } from '../src/main/scan'

describe('scanBraces', () => {
  it('finds an unclosed brace and ignores escaped and commented ones', () => {
    const r = scanBraces('a \\{ b\n\\textbf{bold % }\nmore')
    expect(r.unclosed).toEqual([{ line: 2, col: 7 }])
    expect(r.extra).toEqual([])
  })
  it('finds an extra closing brace', () => {
    expect(scanBraces('\\textbf{x}}').extra).toEqual([{ line: 1, col: 10 }])
  })
  it('skips verbatim environments', () => {
    expect(scanBraces('\\begin{verbatim}\n{{{\n\\end{verbatim}\n').unclosed).toEqual([])
  })
})

describe('scanParagraphBraces', () => {
  it('reports the brace left open when a paragraph ends', () => {
    expect(scanParagraphBraces('ok {fine}\n\\emph{never closed\n\nnext {para}')).toEqual([{ line: 2, col: 5 }])
  })
})

describe('scanEnvironments', () => {
  it('reports a mismatch with where the open environment began', () => {
    const [issue] = scanEnvironments('\\begin{itemize}\n\\item a\n\\end{enumerate}')
    expect(issue).toMatchObject({ kind: 'mismatch', name: 'enumerate', at: { line: 3 }, opened: { name: 'itemize', at: { line: 1 } } })
  })
  it('reports unclosed environments', () => {
    expect(scanEnvironments('\\begin{center}\ntext')).toMatchObject([{ kind: 'unclosed', name: 'center' }])
  })
})

describe('scanMath', () => {
  it('finds inline math still open at the end of a paragraph', () => {
    expect(scanMath('ok $x$ and $y\nstill\n\nnext')).toEqual([{ line: 1, col: 11 }])
  })
  it('does not confuse display math $$ with inline math', () => {
    expect(scanMath('$$x+y$$ and $z$')).toEqual([])
  })
  it('ignores escaped dollars', () => {
    expect(scanMath('costs \\$5 and \\$6')).toEqual([])
  })
})
