import { describe, expect, it } from 'vitest'
import {
  extractRange,
  extractSection,
  headingAt,
  includeBlock,
  inlineInclude,
  moveInclude,
  placeNewFile,
  renameIncludes,
  renumberPlan,
  sectionSpan,
  slugify,
  toggleInclude,
  type Change,
} from '../src/shared/paperedit'
import { parseIncludes } from '../src/shared/project'

const apply = (text: string, changes: Change[]) => [...changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text)

const MAIN = ['\\begin{document}', '\\input{1_intro}', '% the model', '\\input{2_model}', '\\input{3_results}', '\\end{document}', ''].join('\n')
const inc = (text: string, arg: string) => parseIncludes(text).find((i) => i.arg === arg)!

describe('switching and moving includes', () => {
  it('switches an include off and on again', () => {
    const off = apply(MAIN, toggleInclude(MAIN, inc(MAIN, '3_results')))
    expect(off).toContain('\n% \\input{3_results}\n')
    const back = apply(off, toggleInclude(off, inc(off, '3_results')))
    expect(back).toBe(MAIN)
  })

  it('keeps the comment lines above an include with it', () => {
    const b = includeBlock(MAIN, inc(MAIN, '2_model'))
    expect(MAIN.slice(b.from, b.to)).toBe('% the model\n\\input{2_model}\n')
  })

  it('moves an include before or after a sibling', () => {
    const down = apply(MAIN, moveInclude(MAIN, inc(MAIN, '2_model'), inc(MAIN, '3_results'), 'after'))
    expect(down).toBe(['\\begin{document}', '\\input{1_intro}', '\\input{3_results}', '% the model', '\\input{2_model}', '\\end{document}', ''].join('\n'))
    const up = apply(MAIN, moveInclude(MAIN, inc(MAIN, '3_results'), inc(MAIN, '1_intro'), 'before'))
    expect(up).toBe(['\\begin{document}', '\\input{3_results}', '\\input{1_intro}', '% the model', '\\input{2_model}', '\\end{document}', ''].join('\n'))
    expect(moveInclude(MAIN, inc(MAIN, '1_intro'), inc(MAIN, '1_intro'), 'after')).toEqual([])
  })

  it('moves a switched-off include too', () => {
    const text = '\\input{a}\n% \\input{b}\n'
    expect(apply(text, moveInclude(text, inc(text, 'b'), inc(text, 'a'), 'before'))).toBe('% \\input{b}\n\\input{a}\n')
  })
})

describe('new and extracted files', () => {
  it('names and places a new section file like its siblings', () => {
    expect(slugify('Reduced model (2D) of \\emph{local} things here')).toBe('reduced_model_2d_of_local')
    const siblings = [{ rel: 'paper/1_intro.tex', arg: '1_intro' }, { rel: 'paper/2_model.tex', arg: '2_model' }]
    expect(placeNewFile('results', 'paper/main.tex', siblings, () => false)).toEqual({ rel: 'paper/results.tex', arg: 'results' })
    expect(placeNewFile('results', 'paper/main.tex', [{ rel: 'paper/sec/a.tex', arg: 'sec/a.tex' }], (r) => r === 'paper/sec/results.tex')).toEqual({
      rel: 'paper/sec/results_2.tex',
      arg: 'sec/results_2.tex',
    })
  })

  it('finds a section up to the next heading at its level', () => {
    const text = ['\\section{A}', 'a', '\\subsection{A1}', 'a1', '', '\\section{B}', 'b', '\\bibliography{x}'].join('\n')
    expect(text.slice(sectionSpan(text, 3)!.from, sectionSpan(text, 3)!.to)).toBe('\\subsection{A1}\na1\n')
    expect(text.slice(sectionSpan(text, 6)!.from, sectionSpan(text, 6)!.to)).toBe('\\section{B}\nb\n')
    expect(sectionSpan(text, 2)).toBeNull()
  })

  it('moves a section into its own file, and back', () => {
    const text = ['\\section{A}', 'a', '\\subsection{A1}', 'a1', '\\section{B}', 'b', ''].join('\n')
    const out = extractSection(text, 3, 'input', 'a1', '% !TEX root = main.tex\n')!
    const parent = apply(text, out.changes)
    expect(parent).toBe(['\\section{A}', 'a', '\\input{a1}', '\\section{B}', 'b', ''].join('\n'))
    expect(out.body).toBe('% !TEX root = main.tex\n\\subsection{A1}\na1\n')
    expect(apply(parent, inlineInclude(parent, inc(parent, 'a1'), out.body))).toBe(text)
  })
})

describe('moving a range or the heading above the cursor', () => {
  const text = ['\\section{A \\emph{b}}', 'a', 'more a', '\\subsection[short]{A1}', 'a1', ''].join('\n')
  it('finds the nearest heading at or above a line', () => {
    expect(headingAt(text, 3)).toEqual({ line: 1, title: 'A b' })
    expect(headingAt(text, 5)).toEqual({ line: 4, title: 'A1' })
    expect(headingAt('plain\ntext', 2)).toBeNull()
  })
  it('moves whole lines, leaving the include on a line of its own', () => {
    const out = extractRange(text, text.indexOf('a\nmore'), text.indexOf('\\subsection'), 'input', 'x', '% root\n')!
    expect(apply(text, out.changes)).toBe(['\\section{A \\emph{b}}', '\\input{x}', '\\subsection[short]{A1}', 'a1', ''].join('\n'))
    expect(out.body).toBe('% root\na\nmore a\n')
  })
  it('moves part of a line, adding line breaks around the include', () => {
    const t = 'one two three\n'
    const out = extractRange(t, 4, 7, 'input', 'x', '')!
    expect(apply(t, out.changes)).toBe('one \n\\input{x}\n three\n')
    expect(out.body).toBe('two\n')
  })
  it('moves a range that ends the line without adding a blank one', () => {
    const t = 'one\ntwo'
    const out = extractRange(t, 4, 7, 'input', 'x', '')!
    expect(apply(t, out.changes)).toBe('one\n\\input{x}')
    expect(extractRange(t, 2, 2, 'input', 'x', '')).toBeNull()
  })
})

describe('renumbering', () => {
  it('offers renames only when numbered names are out of order', () => {
    expect(renumberPlan(['1_Intro.tex', '2_full.tex', '3_reduced.tex', '67_disc.tex', 'A_App.tex'])).toEqual([])
    // Reordered: the same numbers in the new order; 67 keeps its number.
    expect(renumberPlan(['1_Intro.tex', '3_reduced.tex', '5_Results.tex', '4_calc.tex', '67_disc.tex'])).toEqual([
      { from: '5_Results.tex', to: '4_Results.tex' },
      { from: '4_calc.tex', to: '5_calc.tex' },
    ])
    expect(renumberPlan(['1_Intro.tex', '3_reduced.tex', '2_full.tex', 'A_App.tex'])).toEqual([
      { from: '3_reduced.tex', to: '2_reduced.tex' },
      { from: '2_full.tex', to: '3_full.tex' },
    ])
    // A new file takes the next number; later ones move up only as far as they must.
    expect(renumberPlan(['1_a.tex', '3_c.tex', 'new.tex', '4_d.tex', '67_g.tex'])).toEqual([
      { from: 'new.tex', to: '4_new.tex' },
      { from: '4_d.tex', to: '5_d.tex' },
    ])
    // A new file among numbered ones gets a number too; zero padding is kept.
    expect(renumberPlan(['p/01-a.tex', 'p/new.tex', 'p/02-b.tex'])).toEqual([
      { from: 'p/new.tex', to: 'p/02-new.tex' },
      { from: 'p/02-b.tex', to: 'p/03-b.tex' },
    ])
  })

  it('points includes at renamed files', () => {
    const text = '\\input{sec/1_a}\n\\include{2_b}\n'
    const target = (i: { arg: string }) => (i.arg === 'sec/1_a' ? 'p/sec/1_a.tex' : 'p/2_b.tex')
    const renames = new Map([['p/sec/1_a.tex', 'p/sec/2_a.tex'], ['p/2_b.tex', 'p/1_b.tex']])
    expect(apply(text, renameIncludes(text, parseIncludes(text), target, renames))).toBe('\\input{sec/2_a}\n\\include{1_b}\n')
  })
})
