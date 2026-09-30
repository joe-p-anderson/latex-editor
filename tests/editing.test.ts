import { describe, expect, it } from 'vitest'
import {
  beginEnter,
  commandSignatures,
  DEFAULT_LISTS,
  labels,
  listEnter,
  mirrorEnvRename,
  outline,
  parseSnippets,
  toggleCommand,
  toggleInlineMath,
  wrapBlock,
  type Edit,
} from '../src/shared/latexedit'

const LISTS = { ...DEFAULT_LISTS, questions: 'question', parts: 'part' }

/** Applies an Edit to text with the cursor marked by |, returning text with the new cursor (and selection end) marked. */
function run(marked: string, f: (text: string, from: number, to: number) => Edit | null): string | null {
  const from = marked.indexOf('|')
  let text = marked.replace('|', '')
  let to = from
  const sel = text.indexOf('^') // optional selection end marker
  if (sel >= 0) {
    to = sel
    text = text.replace('^', '')
  }
  const edit = f(text, from, to)
  if (!edit) return null
  let out = text
  for (const c of [...edit.changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  const marks = [{ at: edit.anchor, m: '|' }]
  if (edit.head != null && edit.head !== edit.anchor) marks.push({ at: edit.head, m: '^' })
  for (const { at, m } of marks.sort((a, b) => b.at - a.at)) out = out.slice(0, at) + m + out.slice(at)
  return out
}

describe('toggleCommand', () => {
  const bold = (s: string) => run(s, (t, f, to) => toggleCommand(t, f, to, 'textbf'))
  it('wraps a selection', () => expect(bold('a |word^ b')).toBe('a \\textbf{|word^} b'))
  it('unwraps a selected inside', () => expect(bold('a \\textbf{|word^} b')).toBe('a |word^ b'))
  it('unwraps a selected whole', () => expect(bold('a |\\textbf{word}^ b')).toBe('a |word^ b'))
  it('inserts an empty command', () => expect(bold('a | b')).toBe('a \\textbf{|} b'))
  it('unwraps around the cursor', () => expect(bold('a \\textbf{wo|rd} b')).toBe('a wo|rd b'))
  it('unwraps through nested groups', () => expect(bold('\\textbf{x $\\vec{a|}$ y}')).toBe('x $\\vec{a|}$ y'))
  it('does not unwrap a different command', () => expect(bold('\\emph{wo|rd}')).toBe('\\emph{wo\\textbf{|}rd}'))

  // Ctrl+B in math: \boldsymbol, which also removes an older \mathbf.
  const mathBold = (s: string) => run(s, (t, f, to) => toggleCommand(t, f, to, 'boldsymbol', ['mathbf', 'bm']))
  it('wraps with the math command', () => expect(mathBold('$|F^$')).toBe('$\\boldsymbol{|F^}$'))
  it('unwraps an alternate around the cursor', () => expect(mathBold('$\\mathbf{F|}$')).toBe('$F|$'))
  it('unwraps a selected alternate', () => expect(mathBold('$\\mathbf{|F^}$')).toBe('$|F^$'))
  it('unwraps its own command', () => expect(mathBold('$\\boldsymbol{\\omega|}$')).toBe('$\\omega|$'))
})

describe('toggleInlineMath', () => {
  const m = (s: string, region: { from: number; to: number } | null = null) => run(s, (t, f, to) => toggleInlineMath(t, f, to, region))
  it('wraps', () => expect(m('a |x+1^ b')).toBe('a $|x+1^$ b'))
  it('unwraps', () => expect(m('a $|x+1^$ b')).toBe('a |x+1^ b'))
  it('inserts a pair', () => expect(m('a | b')).toBe('a $|$ b'))
  it('unwraps the math under the cursor', () => expect(m('a $x|y$ b', { from: 2, to: 6 })).toBe('a x|y b'))
})

describe('wrapBlock', () => {
  const align = (s: string) => run(s, (t, f, to) => wrapBlock(t, f, to, '\\begin{align}', '\\end{align}'))
  it('inserts an empty block', () => expect(align('|')).toBe('\\begin{align}\n    |\n\\end{align}'))
  it('wraps a selection', () => expect(align('|x &= 1^')).toBe('\\begin{align}\n    |x &= 1^\n\\end{align}'))
  it('starts and ends on lines of their own', () =>
    expect(align('so |F = ma^ here')).toBe('so\n\\begin{align}\n    |F = ma^\n\\end{align}\nhere'))
  it('keeps relative indentation and the line indent', () =>
    expect(align('  |a &= b \\\\\n    &= c^')).toBe('  \\begin{align}\n      |a &= b \\\\\n        &= c^\n  \\end{align}'))
})

describe('listEnter', () => {
  const enter = (s: string) => run(s, (t, f) => listEnter(t, f, LISTS))
  it('continues an item', () =>
    expect(enter('\\begin{itemize}\n    \\item one|\n\\end{itemize}')).toBe('\\begin{itemize}\n    \\item one\n    \\item |\n\\end{itemize}'))
  it('continues from a wrapped line of the item', () =>
    expect(enter('\\begin{itemize}\n  \\item one\n    more|\n\\end{itemize}')).toBe('\\begin{itemize}\n  \\item one\n    more\n  \\item |\n\\end{itemize}'))
  it('uses the configured marker', () =>
    expect(enter('\\begin{questions}\n\\question Why?|\n\\end{questions}')).toBe('\\begin{questions}\n\\question Why?\n\\question |\n\\end{questions}'))
  it('ignores items of a closed nested list', () =>
    expect(enter('\\begin{parts}\n  \\part a\n  \\begin{itemize}\n        \\item x\n  \\end{itemize}\n  text|\n\\end{parts}')).toBe(
      '\\begin{parts}\n  \\part a\n  \\begin{itemize}\n        \\item x\n  \\end{itemize}\n  text\n  \\part |\n\\end{parts}',
    ))
  it('leaves a list from its last, empty item', () =>
    expect(enter('\\begin{itemize}\n    \\item one\n    \\item |\n\\end{itemize}\nafter')).toBe('\\begin{itemize}\n    \\item one\n\\end{itemize}\n|\nafter'))
  it('leaves a nested list into the parent list', () =>
    expect(enter('\\begin{questions}\n\\question Q\n\\begin{parts}\n    \\part a\n    \\part|\n\\end{parts}\n\\end{questions}')).toBe(
      '\\begin{questions}\n\\question Q\n\\begin{parts}\n    \\part a\n\\end{parts}\n\\question |\n\\end{questions}',
    ))
  it('clears an empty item in the middle', () =>
    expect(enter('\\begin{itemize}\n    \\item |\n    \\item two\n\\end{itemize}')).toBe('\\begin{itemize}\n    |\n    \\item two\n\\end{itemize}'))
  it('does nothing on a blank line', () => expect(enter('\\begin{itemize}\n    \\item a\n|\n\\end{itemize}')).toBeNull())
  it('does nothing outside a list', () => expect(enter('\\begin{center}\ntext|\n\\end{center}')).toBeNull())
  it('does nothing in a non-list inside a list', () =>
    expect(enter('\\begin{parts}\n\\part a\n\\begin{minipage}{1in}\ntext|\n\\end{minipage}\n\\end{parts}')).toBeNull())
  it('treats \\part as distinct from \\partial', () =>
    expect(enter('\\begin{parts}\n  \\part a\n    $\\partial$|\n\\end{parts}')).toBe('\\begin{parts}\n  \\part a\n    $\\partial$\n  \\part |\n\\end{parts}'))
})

describe('beginEnter', () => {
  const enter = (s: string) => run(s, (t, f) => beginEnter(t, f, LISTS))
  it('closes an environment', () => expect(enter('\\begin{center}|')).toBe('\\begin{center}\n    |\n\\end{center}'))
  it('adds the first item to a list', () => expect(enter('  \\begin{parts}|')).toBe('  \\begin{parts}\n      \\part |\n  \\end{parts}'))
  it('keeps arguments', () =>
    expect(enter('\\begin{minipage}[t]{0.55\\linewidth}|')).toBe('\\begin{minipage}[t]{0.55\\linewidth}\n    |\n\\end{minipage}'))
  it('leaves a closed environment alone', () => expect(enter('\\begin{center}|\n\\end{center}')).toBeNull())
  it('closes a new one above a closed one', () =>
    expect(enter('\\begin{center}|\n\\begin{center}\n\\end{center}')).toBe('\\begin{center}\n    |\n\\end{center}\n\\begin{center}\n\\end{center}'))
  it('needs the cursor at the end of the line', () => expect(enter('\\begin{center}| x')).toBeNull())
})

describe('mirrorEnvRename', () => {
  const doc = '\\begin{itemize}\n\\item a\n\\begin{itemize}\\end{itemize}\n\\end{itemize}'
  it('renames the matching end', () => {
    expect(mirrorEnvRename(doc, 7, 14, 'enumerate')).toEqual({ from: doc.lastIndexOf('itemize'), to: doc.lastIndexOf('itemize') + 7, insert: 'enumerate' })
  })
  it('renames the matching begin', () => {
    const at = doc.lastIndexOf('itemize')
    expect(mirrorEnvRename(doc, at + 7, at + 7, 's')).toEqual({ from: 7, to: 14, insert: 'itemizes' })
  })
  it('ignores edits outside names', () => expect(mirrorEnvRename(doc, 16, 16, 'x')).toBeNull())
  it('ignores unmatched environments', () => expect(mirrorEnvRename('\\begin{foo}', 7, 7, 'x')).toBeNull())
})

describe('outline', () => {
  it('lists sections and numbered questions', () => {
    const tex = [
      '\\section{Vector algebra}',
      '\\begin{questions}',
      '\\question \\textbf{Vectors and components}:',
      '% \\question commented out',
      '\\question[5] How far?',
      '\\question \\textbf{Tangents}: On the last homework',
      '\\end{questions}',
      '\\section*{Kinematics}',
      '\\begin{questions}\\question',
      '\\end{questions}',
    ].join('\n')
    expect(outline(tex)).toEqual([
      { kind: 'section', depth: 0, title: 'Vector algebra', line: 1 },
      { kind: 'question', depth: 1, title: '1. Vectors and components', line: 3 },
      { kind: 'question', depth: 1, title: '2. How far?', line: 5 },
      { kind: 'question', depth: 1, title: '3. Tangents', line: 6 },
      { kind: 'section', depth: 0, title: 'Kinematics', line: 8 },
      { kind: 'question', depth: 1, title: 'Question 4', line: 9 },
    ])
  })
})

describe('labels', () => {
  it('finds labels outside comments', () => expect(labels('\\label{eq:a} % \\label{no}\n\\label{fig:b}\\label{eq:a}')).toEqual(['eq:a', 'fig:b']))
})

describe('parseSnippets', () => {
  it('reads headers and bodies', () => {
    const text = 'Instructions here.\n%%% qparts — Question with parts\n\\question ${1:text}\n\\begin{parts}\n    \\part ${2}\n\\end{parts}\n\n%%% bare\nx\n'
    expect(parseSnippets(text)).toEqual([
      { name: 'qparts', description: 'Question with parts', body: '\\question ${1:text}\n\\begin{parts}\n\t\\part ${2}\n\\end{parts}' },
      { name: 'bare', description: '', body: 'x' },
    ])
  })
})

describe('commandSignatures', () => {
  it('reads argument counts', () => {
    const cls = [
      '\\newcommand{\\answerspace}[1]{\\vspace{#1}}',
      '\\newcommand{\\blank}[1][1in]{\\underline{\\hspace{#1}}}',
      '\\newcommand{\\ranking}[3][4]{x}',
      '\\newcommand{\\hd@style}[1]{x}',
      '\\renewcommand\\questionlabel{x}',
      '\\NewDocumentCommand{\\pair}{o m m}{x}',
    ].join('\n')
    expect(commandSignatures(cls)).toEqual([
      { name: 'answerspace', args: 1, optional: false },
      { name: 'blank', args: 0, optional: true },
      { name: 'ranking', args: 2, optional: true },
      { name: 'questionlabel', args: 0, optional: false },
      { name: 'pair', args: 2, optional: true },
    ])
  })
})
