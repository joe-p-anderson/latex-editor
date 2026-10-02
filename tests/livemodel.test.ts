import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LISTS } from '../src/shared/latexedit'
import { inlineParts, liveModel, parseTabular, type LiveNode } from '../src/shared/livemodel'
import { createRenderer } from '../src/shared/mathrender'

const LISTS = { ...DEFAULT_LISTS, questions: 'question', parts: 'part', subparts: 'subpart', choices: 'choice', checkboxes: 'choice' }

const model = (text: string) => liveModel(text, LISTS)
const of = <K extends LiveNode['kind']>(text: string, kind: K) =>
  model(text).nodes.filter((n): n is Extract<LiveNode, { kind: K }> => n.kind === kind)

describe('liveModel', () => {
  it('folds the preamble and counts what is in it', () => {
    const [pre] = of('\\documentclass[12pt]{handout}\n\\usepackage{amsmath,siunitx}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\nHi', 'preamble')
    expect(pre).toMatchObject({ from: 0, docclass: 'handout', packages: 2, macros: 1 })
    expect(pre.to).toBe('\\documentclass[12pt]{handout}\n\\usepackage{amsmath,siunitx}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}'.length)
  })

  it('numbers sections the LaTeX way, with the outermost level used as h1', () => {
    const hs = of('\\section{A}\n\\subsection{B}\n\\subsection*{C}\n\\subsection{D}\n\\section{E}\n\\subsection{F}', 'heading')
    expect(hs.map((h) => [h.level, h.number])).toEqual([
      [1, '1'],
      [2, '1.1'],
      [2, null],
      [2, '1.2'],
      [1, '2'],
      [2, '2.1'],
    ])
    const text = '\\section{Intro}'
    const [h] = of(text, 'heading')
    expect(text.slice(h.openTo, h.closeFrom)).toBe('Intro')
  })

  it('keeps question numbers going across questions environments, and restarts parts', () => {
    const text = [
      '\\begin{questions}',
      '\\question[5] One',
      '\\begin{parts}',
      '  \\part a',
      '  \\part b',
      '\\end{parts}',
      '\\question Two',
      '\\end{questions}',
      '\\section{More}',
      '\\begin{questions}',
      '\\question Three',
      '\\begin{parts}\\part x\\end{parts}',
      '\\end{questions}',
      '\\resetquestions',
      '\\begin{questions}\\question Again\\end{questions}',
    ].join('\n')
    const items = of(text, 'item')
    expect(items.map((i) => i.label)).toEqual(['1.', '(a)', '(b)', '2.', '3.', '(a)', '1.'])
    expect(items[0].points).toBe('5')
    expect(items.map((i) => i.depth)).toEqual([1, 2, 2, 1, 1, 2, 1])
  })

  it('labels enumerate, itemize and description items', () => {
    const text = '\\begin{enumerate}\\item a\\begin{enumerate}\\item b\\end{enumerate}\\item c\\end{enumerate}\\begin{itemize}\\item d\\item[x] e\\end{itemize}'
    expect(of(text, 'item').map((i) => [i.label, i.style])).toEqual([
      ['1.', 'number'],
      ['(a)', 'number'],
      ['2.', 'number'],
      ['•', 'bullet'],
      ['x', 'term'],
    ])
    expect(of(text, 'fence').map((f) => `${f.begin ? '+' : '-'}${f.env}`)).toEqual(['+enumerate', '+enumerate', '-enumerate', '-enumerate', '+itemize', '-itemize'])
  })

  it('resolves refs to sections, equations, figures and questions, forward or back', () => {
    const text = [
      'See \\ref{fig:a}, \\eqref{eq:b}, \\cref{sec:s} and Q\\ref{q:two}; \\ref{nope}.',
      '\\section{S}\\label{sec:s}',
      '\\begin{equation}x\\label{eq:a}\\end{equation}',
      '\\begin{align}a&=b\\label{eq:b}\\\\ c&=d\\nonumber\\\\ e&=f\\end{align}',
      '\\begin{figure}\\includegraphics{img/a.png}\\caption{A $x$}\\label{fig:a}\\end{figure}',
      '\\begin{questions}\\question one\\question two\\label{q:two}\\end{questions}',
    ].join('\n')
    const m = model(text)
    expect(m.labels.get('eq:a')?.number).toBe('1')
    expect(m.labels.get('eq:b')?.number).toBe('2')
    const refs = m.nodes.filter((n) => n.kind === 'ref').map((n) => (n as { text: string | null }).text)
    expect(refs).toEqual(['1', '(2)', 'section 1', '2', null])
    const [fig] = m.nodes.filter((n) => n.kind === 'figure') as Extract<LiveNode, { kind: 'figure' }>[]
    expect(fig).toMatchObject({ images: ['img/a.png'], caption: 'A $x$', number: '1', labels: ['fig:a'] })
  })

  it('tags numbered math rows so MathJax draws the numbers, and they render', () => {
    const text = '\\begin{align}a&=b\\\\ c&=d\\nonumber\\\\ e&=f\\end{align} and \\begin{equation*}y\\end{equation*}'
    const maths = of(text, 'math')
    expect(maths[0].tex).toBe('\\begin{align}a&=b\\tag{1}\\\\ c&=d\\nonumber\\\\ e&=f\\tag{2}\\end{align}')
    expect(maths[1].tex).toBe('\\begin{equation*}y\\end{equation*}')
    const out = createRenderer()(maths[0].tex, true)
    expect(out.error).toBeNull()
    expect(out.svg).toContain('<svg')
  })

  it('finds inline math, siunitx, formatting, labels and symbols, but nothing inside math', () => {
    const text = 'A \\textbf{bold $x_{\\textbf{y}}$} move of \\SI{9.8}{m/s^2} -- see~\\label{k} 50\\% ``q\'\'.'
    const kinds = model(text).nodes.map((n) => n.kind)
    expect(kinds).toEqual(['format', 'math', 'math', 'symbol', 'symbol', 'label', 'symbol', 'symbol', 'symbol'])
    const syms = of(text, 'symbol').map((s) => s.text)
    expect(syms).toEqual(['–', '\u00a0', '%', '“', '”'])
    const [f] = of(text, 'format')
    expect(text.slice(f.openTo, f.closeFrom)).toBe('bold $x_{\\textbf{y}}$')
  })

  it('leaves verbatim alone', () => {
    const text = '\\begin{verbatim}\n\\section{no} $x$ --\n\\end{verbatim}'
    expect(model(text).nodes.map((n) => n.kind)).toEqual(['verbatim'])
  })

  it('parses tables with rules, alignment and multicolumn', () => {
    const t = parseTabular('|l|*{2}{c}|', '\\hline A & B & C \\\\ \\hline\n\\multicolumn{2}{r}{wide} & $x$ \\\\\n\\hline')!
    expect(t.cols).toEqual(['l', 'c', 'c'])
    expect(t.vlines).toEqual([true, true, false, true])
    expect(t.rows.map((r) => [r.ruleAbove, r.cells.map((c) => `${c.tex}/${c.span}/${c.align}`)])).toEqual([
      [true, ['A/1/l', 'B/1/c', 'C/1/c']],
      [true, ['wide/2/r', '$x$/1/c']],
    ])
    expect(t.ruleBelow).toBe(true)
    const [table] = of('\\begin{table}\\centering\\begin{tabular}{cc}a&b\\\\\\end{tabular}\\caption{T}\\end{table}', 'table')
    expect(table.tabular?.rows[0].cells.map((c) => c.tex)).toEqual(['a', 'b'])
    expect(table.number).toBe('1')
  })

  it('turns captions into styled text and math pieces', () => {
    expect(inlineParts('The \\textbf{big} one, $x^2$ -- done~now')).toEqual([
      { text: 'The ', math: false },
      { text: 'big', math: false, style: 'bold' },
      { text: ' one, ', math: false },
      { text: 'x^2', math: true },
      { text: ' – done\u00a0now', math: false },
    ])
  })

  it('makes one title block of a run of front-matter commands, comments and all', () => {
    const text = [
      '\\begin{document}',
      '\\title{A \\\\ B}',
      '\\author{Ann}\\altaffiliation[Now at: ]{Elsewhere}\\email{a@b.c}',
      ' \\affiliation{Uni}% a note',
      '',
      '\\date{\\today}% always today,',
      '   % but any date will do',
      '\\begin{abstract}',
      'Short $x$.',
      '\\end{abstract}',
      '\\maketitle',
    ].join('\n')
    const [front] = of(text, 'front')
    expect(front.parts.map((p) => [p.cmd, p.opt, p.arg])).toEqual([
      ['title', null, 'A \\\\ B'],
      ['author', null, 'Ann'],
      ['altaffiliation', 'Now at: ', 'Elsewhere'],
      ['email', null, 'a@b.c'],
      ['affiliation', null, 'Uni'],
      ['date', null, '\\today'],
    ])
    expect(text.slice(front.from, front.to)).toBe(text.slice(text.indexOf('\\title'), text.indexOf('\n\\begin{abstract}')))
    expect(of(text, 'fence').map((f) => [f.env, f.begin])).toEqual([
      ['abstract', true],
      ['abstract', false],
      ['maketitle', true],
    ])
    const [inset] = model(text).insets
    expect(text.slice(inset.from, inset.to)).toBe('\nShort $x$.\n')
    expect(of(text, 'math')).toHaveLength(1)
  })

  it('stops the preamble fold where front matter written in the preamble starts', () => {
    const text = '\\documentclass{revtex4-2}\n\\usepackage{amsmath}\n\n\\title{T}\n\\begin{document}\n\\maketitle\n\\end{document}'
    const [pre] = of(text, 'preamble')
    expect(text.slice(pre.from, pre.to)).toBe('\\documentclass{revtex4-2}\n\\usepackage{amsmath}')
    expect(of(text, 'front')).toHaveLength(1)
    expect(of(text, 'fence').map((f) => [f.env, f.begin])).toEqual([
      ['document', true],
      ['maketitle', true],
      ['document', false],
    ])
  })

  it('tags subequations at its \\begin and \\end, and numbers its rows', () => {
    const text = '\\begin{subequations}\n\\begin{align}a\\\\b\\end{align}\n\\end{subequations}'
    expect(of(text, 'fence').map((f) => [f.env, f.begin])).toEqual([
      ['subequations', true],
      ['subequations', false],
    ])
    expect(of(text, 'math')[0].tex).toContain('\\tag{1b}')
  })

  it('handles every fixture document without throwing, with sorted nodes', () => {
    const root = resolve(import.meta.dirname, '../fixtures')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (f.endsWith('.tex')) files.push(p)
      }
    }
    walk(root)
    expect(files.length).toBeGreaterThan(20)
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
      const m = model(text)
      for (let i = 1; i < m.nodes.length; i++) expect(m.nodes[i].from).toBeGreaterThanOrEqual(m.nodes[i - 1].from)
    }
  })
})

describe('citations', () => {
  it('finds every cite variant, with optional arguments and stars', () => {
    const text = '\\begin{document}\nA \\cite{a} B \\citep[see][p.~4]{b, c} C \\parencite*{d} D \\citeauthor{e}\n\\end{document}'
    const refs = liveModel(text, DEFAULT_LISTS).nodes.filter((n) => n.kind === 'ref') as Extract<LiveNode, { kind: 'ref' }>[]
    expect(refs.map((r) => [r.cmd, r.keys])).toEqual([
      ['cite', ['a']],
      ['citep', ['b', 'c']],
      ['parencite', ['d']],
      ['citeauthor', ['e']],
    ])
    expect(text.slice(refs[1].from, refs[1].to)).toBe('\\citep[see][p.~4]{b, c}')
  })
})
