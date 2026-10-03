import { describe, expect, it } from 'vitest'
import {
  addToPreamble,
  buildDocument,
  dedentBlock,
  detectNeeds,
  entryFor,
  findQuestionBlock,
  formatNeeds,
  guessTitle,
  insertText,
  makeFragment,
  missingDefinitions,
  newFragmentPath,
  parseNeeds,
  parseProblemHeader,
  previewBlocks,
  readDefinitions,
  searchableText,
  serializeProblem,
  usedInTexts,
} from '../src/plugins/problem-bank/bank'

const FRAGMENT = `% problem: Projectile off a cliff
% tags: kinematics, projectile motion
% difficulty: 2
% source: adapted from Giancoli 3.24
% needs: siunitx, [T1]fontenc
% preamble: \\DeclareSIUnit{\\solarmass}{\\text{M}_{\\odot}}
% preamble: \\newcommand{\\R}{\\mathbb{R}}
\\question A ball is thrown horizontally from a \\SI{20}{m} cliff.
\\begin{parts}
  \\part How long is it in the air?
\\end{parts}
`

describe('parseProblemHeader', () => {
  it('reads every field', () => {
    const { meta, body } = parseProblemHeader(FRAGMENT)
    expect(meta.title).toBe('Projectile off a cliff')
    expect(meta.tags).toEqual(['kinematics', 'projectile motion'])
    expect(meta.difficulty).toBe(2)
    expect(meta.source).toBe('adapted from Giancoli 3.24')
    expect(meta.needs).toEqual(['siunitx', { name: 'fontenc', options: 'T1' }])
    expect(meta.preamble).toEqual(['\\DeclareSIUnit{\\solarmass}{\\text{M}_{\\odot}}', '\\newcommand{\\R}{\\mathbb{R}}'])
    expect(body.startsWith('\\question A ball')).toBe(true)
    expect(body.endsWith('\\end{parts}\n')).toBe(true)
  })

  it('reads CRLF input', () => {
    const { meta, body } = parseProblemHeader(FRAGMENT.replace(/\n/g, '\r\n'))
    expect(meta.title).toBe('Projectile off a cliff')
    expect(meta.preamble).toHaveLength(2)
    expect(meta.needs).toHaveLength(2)
    expect(body).not.toContain('\r')
    expect(body).toContain('\\part How long')
  })

  it('treats every field as optional', () => {
    const { meta, body } = parseProblemHeader('\\question Just text\n')
    expect(meta).toEqual({ title: '', tags: [], difficulty: null, source: '', needs: [], preamble: [] })
    expect(body).toBe('\\question Just text\n')
  })

  it('keeps comments that are not fields with the problem', () => {
    const { meta, body } = parseProblemHeader('% problem: A\n% remember to check this\n\\question X\n')
    expect(meta.title).toBe('A')
    expect(body).toBe('% remember to check this\n\\question X\n')
  })

  it('clamps and ignores a bad difficulty', () => {
    expect(parseProblemHeader('% difficulty: 9\n\\question\n').meta.difficulty).toBe(5)
    expect(parseProblemHeader('% difficulty: hard\n\\question\n').meta.difficulty).toBeNull()
  })

  it('reads needs with options holding commas', () => {
    expect(parseNeeds('[a,b]pkg, other')).toEqual([{ name: 'pkg', options: 'a,b' }, 'other'])
    expect(formatNeeds(parseNeeds('siunitx, [T1]fontenc'))).toBe('siunitx, [T1]fontenc')
  })
})

describe('serializeProblem', () => {
  it('round-trips a fragment', () => {
    const { meta, body } = parseProblemHeader(FRAGMENT)
    expect(serializeProblem(meta, body)).toBe(FRAGMENT)
  })

  it('writes no header for no fields, and only the fields that are set', () => {
    expect(serializeProblem({}, '\\question X\n\n\n')).toBe('\\question X\n')
    expect(serializeProblem({ title: 'T', tags: ['a'] }, '\\question X')).toBe('% problem: T\n% tags: a\n\\question X\n')
  })

  it('titles a fragment from its file name when it has none', () => {
    expect(makeFragment('Problems/ball_off_a_cliff.tex', '\\question X\n', { library: false }).title).toBe('Ball off a cliff')
  })
})

describe('used in', () => {
  const fragments = ['Problems/cliff.tex', 'Problems/spring.tex', 'Problems/lonely.tex', 'Problems/Sub/deep.tex']
  it('finds \\input and \\include of a fragment, from the vault root and from the including folder', () => {
    const used = usedInTexts(fragments, {
      'Homework/HW3.tex': '\\begin{questions}\n\\input{Problems/cliff}\n\\input{Problems/spring.tex}\n\\end{questions}',
      'Homework/HW7.tex': '\\include{Problems/cliff}\r\n',
      'Labs/Problems/x.tex': '\\input{spring}',
      'Notes.tex': '\\input{Problems/Sub/deep}',
    })
    expect(used.get('Problems/cliff.tex')).toEqual(['Homework/HW3.tex', 'Homework/HW7.tex'])
    expect(used.get('Problems/spring.tex')).toEqual(['Homework/HW3.tex'])
    expect(used.get('Problems/Sub/deep.tex')).toEqual(['Notes.tex'])
    expect(used.get('Problems/lonely.tex')).toEqual([])
  })

  it('finds a fragment next to the including file', () => {
    const used = usedInTexts(['Problems/cliff.tex'], { 'Problems/set.tex': '\\input{cliff}' })
    expect(used.get('Problems/cliff.tex')).toEqual(['Problems/set.tex'])
  })

  it('ignores commented-out includes and other files of the same name', () => {
    const used = usedInTexts(fragments, {
      'HW1.tex': '% \\input{Problems/cliff}\n\\input{Other/cliff}\n',
      'HW2.tex': '\\input{Problems/cliff} % trailing\n',
    })
    expect(used.get('Problems/cliff.tex')).toEqual(['HW2.tex'])
  })

  it('matches case-insensitively and counts a file once', () => {
    const used = usedInTexts(fragments, { 'HW1.tex': '\\input{problems/Cliff}\n\\input{Problems/cliff}\n' })
    expect(used.get('Problems/cliff.tex')).toEqual(['HW1.tex'])
  })
})

describe('findQuestionBlock', () => {
  const doc = [
    '\\begin{questions}',
    '  \\question First one',
    '  \\begin{parts}',
    '    \\part a',
    '  \\end{parts}',
    '',
    '  \\question Second % \\question in a comment',
    '  more text',
    '\\end{questions}',
    'after',
  ].join('\n')

  it('runs from \\question to just before the next one', () => {
    const at = doc.indexOf('\\part a')
    const b = findQuestionBlock(doc, at)!
    expect(doc.slice(b.from, b.to)).toBe('\\question First one\n  \\begin{parts}\n    \\part a\n  \\end{parts}')
  })

  it('stops at \\end{questions} and ignores commented \\question', () => {
    const b = findQuestionBlock(doc, doc.indexOf('more text'))!
    expect(doc.slice(b.from, b.to)).toBe('\\question Second % \\question in a comment\n  more text')
  })

  it('is null outside a question', () => {
    expect(findQuestionBlock(doc, 2)).toBeNull()
    expect(findQuestionBlock(doc, doc.indexOf('after'))).toBeNull()
  })

  it('belongs to the next question when the cursor is on its command', () => {
    const b = findQuestionBlock(doc, doc.indexOf('\\question Second'))!
    expect(doc.slice(b.from, b.from + 18)).toBe('\\question Second %')
  })

  it('removes the document indentation', () => {
    const b = findQuestionBlock(doc, doc.indexOf('\\part a'))!
    expect(dedentBlock(doc, b)).toBe('\\question First one\n\\begin{parts}\n  \\part a\n\\end{parts}')
  })

  it('guesses a title from the bold heading, else the first words', () => {
    expect(guessTitle('\\question \\textbf{Unit conversions}: stuff')).toBe('Unit conversions')
    expect(guessTitle('\\question A ball is thrown')).toBe('A ball is thrown')
  })

  it('names new fragments without overwriting', () => {
    const taken = new Set(['Problems/unit_conversions.tex'])
    expect(newFragmentPath('Problems', 'Unit conversions', (r) => taken.has(r))).toBe('Problems/unit_conversions_2.tex')
  })
})

describe('needs detection', () => {
  const preamble = String.raw`\documentclass{handout}
\usepackage[separate-uncertainty]{siunitx}
\usepackage{amsmath, graphicx}
\DeclareSIUnit{\solarmass}{\text{M}_{\odot}}
\newcommand{\vect}[1]{\mathbf{#1}}
\newcommand{\unused}{x}
\newcommand{\Fnet}{\vect{F}_{\mathrm{net}}}
% \newcommand{\commented}{no}
\DeclareMathOperator{\sgn}{sgn}
\begin{document}`

  it('finds packages for the commands a block uses, with the source options', () => {
    const r = detectNeeds(String.raw`\question \SI{20}{m} and $\dfrac{1}{2}$`, preamble)
    expect(r.needs).toEqual([{ name: 'siunitx', options: 'separate-uncertainty' }, 'amsmath'])
    expect(r.preamble).toEqual([])
  })

  it('finds custom definitions the block uses, and the ones those use', () => {
    const r = detectNeeds(String.raw`\question $\Fnet$ and \SI{1}{\solarmass}`, preamble)
    expect(r.preamble).toEqual([
      String.raw`\DeclareSIUnit{\solarmass}{\text{M}_{\odot}}`,
      String.raw`\newcommand{\vect}[1]{\mathbf{#1}}`,
      String.raw`\newcommand{\Fnet}{\vect{F}_{\mathrm{net}}}`,
    ])
    expect(r.needs.map((p) => (typeof p === 'string' ? p : p.name))).toContain('siunitx')
  })

  it('does not pick up unused or commented definitions', () => {
    const r = detectNeeds('\\question plain', preamble)
    expect(r).toEqual({ needs: [], preamble: [] })
  })

  it('knows environments, and a definition that needs a package', () => {
    const r = detectNeeds(String.raw`\question \begin{tikzpicture}\end{tikzpicture} $\sgn x$`, preamble)
    expect(r.needs).toContain('tikz')
    expect(r.preamble).toEqual([String.raw`\DeclareMathOperator{\sgn}{sgn}`])
    expect(r.needs).toContain('amsmath')
  })

  it('reads definitions of several kinds, multi-line ones on a single line', () => {
    const defs = readDefinitions('\\newcommand{\\a}[2][x]{\n  body #1\n}\n\\def\\b#1{#1}\n\\newenvironment{proof2}{start}{end}\n\\renewcommand*\\c{z}')
    expect(defs.map((d) => d.name)).toEqual(['\\a', '\\b', 'proof2', '\\c'])
    expect(defs[0].text).toBe('\\newcommand{\\a}[2][x]{ body #1 }')
    expect(defs[2].env).toBe(true)
  })

  it('only lists definitions the document lacks', () => {
    const doc = '\\documentclass{x}\n\\newcommand{\\R}{\\mathbb{R}}\n% \\newcommand{\\S}{s}\n\\begin{document}'
    expect(missingDefinitions(doc, ['\\newcommand{\\R}{\\mathbb{R}}', '\\newcommand{\\S}{s}', '\\newcommand{\\Q}{q}'])).toEqual(['\\newcommand{\\S}{s}', '\\newcommand{\\Q}{q}'])
  })

  it('adds definitions before \\begin{document}', () => {
    const doc = '\\documentclass{x}\n\n\\begin{document}\nhi'
    const c = addToPreamble(doc, ['\\newcommand{\\Q}{q}'])!
    expect(doc.slice(0, c.from) + c.insert + doc.slice(c.to)).toBe('\\documentclass{x}\n\n\\newcommand{\\Q}{q}\n\\begin{document}\nhi')
    expect(addToPreamble('no document here', ['x'])).toBeNull()
  })
})

describe('documents', () => {
  const f = makeFragment('Problems/cliff.tex', FRAGMENT, { library: false })

  it('wraps a fragment for checking', () => {
    const src = buildDocument({ preamble: null, documentClass: 'exam', entries: [entryFor(f)] })
    expect(src).toContain('\\documentclass{exam}')
    expect(src).toContain('\\usepackage{siunitx}')
    expect(src).toContain('\\usepackage[T1]{fontenc}')
    expect(src).toContain('\\DeclareSIUnit{\\solarmass}')
    expect(src).toContain('\\input{Problems/cliff}')
    expect(src.indexOf('\\documentclass')).toBeLessThan(src.indexOf('\\begin{document}'))
    expect(src.indexOf('\\begin{questions}')).toBeLessThan(src.indexOf('\\input'))
  })

  it('uses a preamble file up to \\begin{document}, and skips what it already has', () => {
    const pre = '\\documentclass{handout}\n\\usepackage{siunitx}\n\\newcommand{\\R}{R}\n\\begin{document}\nignored\n'
    const src = buildDocument({ preamble: pre, documentClass: 'exam', entries: [entryFor(f)] })
    expect(src).toContain('\\documentclass{handout}')
    expect(src).not.toContain('ignored')
    expect(src.match(/\\usepackage\{siunitx\}/g)).toHaveLength(1)
    expect(src.match(/\\newcommand\{\\R\}/g)).toHaveLength(1)
    expect(src.match(/\\begin\{document\}/g)).toHaveLength(1)
  })

  it('inlines a library problem', () => {
    const lib = makeFragment('lib:x.tex', '\\question Hello\n', { library: true })
    expect(entryFor(lib).inline).toBe('\\question Hello\n')
    expect(buildDocument({ preamble: null, documentClass: 'exam', entries: [entryFor(lib)] })).toContain('  \\question Hello')
  })

  it('inserts an \\input or the text without its header', () => {
    expect(insertText(f, 'input')).toBe('\\input{Problems/cliff}')
    expect(insertText(f, 'copy').startsWith('\\question A ball')).toBe(true)
    expect(insertText(makeFragment('lib:x.tex', '\\question Hi\n', { library: true }), 'input')).toBe('\\question Hi')
  })
})

describe('previews', () => {
  it('turns a problem into readable blocks with math', () => {
    const blocks = previewBlocks(
      '\\question \\textbf{Cliff}: A ball falls \\SI{20}{m}. Then $x^2$ % hidden\n\\begin{parts}\n\\part Find $t$.\\footnote{No.}\n\\part Next\n\\end{parts}\n',
    )
    expect(blocks.map((b) => b.label)).toEqual([null, '(a)', '(b)'])
    expect(blocks[0].segs).toEqual([
      { t: 'text', s: 'Cliff: A ball falls ' },
      { t: 'math', tex: '\\SI{20}{m}', display: false },
      { t: 'text', s: '. Then ' },
      { t: 'math', tex: 'x^2', display: false },
    ])
    expect(blocks[1].segs[blocks[1].segs.length - 1]).toEqual({ t: 'text', s: '.' })
    expect(JSON.stringify(blocks)).not.toContain('No.')
  })

  it('leaves solutions out', () => {
    expect(searchableText('\\question Q\n\\begin{solution}secret\\end{solution}')).toBe('Q')
  })
})
