// The words a spellchecker should look at in a LaTeX document: the prose,
// and nothing else. Left out:
//  - math, comments, verbatim-like environments and TikZ pictures;
//  - the preamble, except the arguments of \title, \author and \date;
//  - command names, optional [...] arguments, and the arguments of commands
//    whose arguments aren't prose (\label, \ref, \cite, \includegraphics,
//    \usepackage, \begin, \url, the first argument of \href, lengths, units, …);
//  - words of one letter, words next to digits (2nd), and all-caps words of
//    up to five letters (acronyms such as NASA).
// The arguments of everything else (\textbf, \emph, \section, \caption, the
// user's own macros) are prose and are checked.
import { blankComments, closingBrace } from './latexedit'
import { findMathRegions } from './mathregions'

export interface ProseWord {
  word: string
  from: number
  to: number
}

// Command → how many of its {…} arguments aren't prose (Infinity: all of them).
const SKIP: Record<string, number> = {}
const skip = (n: number, ...names: string[]) => names.forEach((c) => (SKIP[c] = n))
skip(1, 'label', 'ref', 'eqref', 'pageref', 'autoref', 'Autoref', 'cref', 'Cref', 'nameref', 'vref', 'Vref', 'cpageref')
skip(1, 'cite', 'citep', 'citet', 'citealt', 'citeauthor', 'citeyear', 'parencite', 'textcite', 'autocite', 'nocite')
skip(1, 'input', 'include', 'includeonly', 'includegraphics', 'includepdf', 'usepackage', 'RequirePackage', 'documentclass', 'LoadClass')
skip(1, 'url', 'href', 'hyperref', 'color', 'textcolor', 'colorbox', 'pagecolor', 'end', 'answerspace', 'raisebox', 'scalebox')
skip(1, 'hspace', 'vspace', 'hskip', 'vskip', 'kern', 'pagestyle', 'thispagestyle', 'pagenumbering', 'bibliography', 'bibliographystyle')
skip(1, 'setcounter', 'addtocounter', 'stepcounter', 'refstepcounter', 'newcounter', 'value', 'arabic', 'roman', 'Roman', 'alph', 'Alph', 'ding')
skip(1, 'setlist', 'setenumerate', 'setitemize', 'setdescription', 'newlist', 'geometry', 'hypersetup', 'graphicspath', 'addbibresource', 'fontsize', 'linespread', 'newlength', 'tag', 'lstinline', 'mintinline')
skip(2, 'multicolumn', 'resizebox', 'setlength', 'addtolength', 'multirow', 'rule')
skip(Infinity, 'begin', 'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment', 'DeclareMathOperator')
skip(Infinity, 'SI', 'si', 'qty', 'unit', 'num', 'ang', 'SIrange', 'qtyrange', 'numrange', 'cline', 'cmidrule', 'definecolor', 'newtheorem')

/** Environments whose whole body isn't prose. */
const SKIP_ENVS = /^(verbatim|Verbatim|lstlisting|minted|comment|tikzpicture|pgfpicture|filecontents|asy)\*?$/
/** Preamble commands whose argument is prose. */
const PREAMBLE_PROSE = new Set(['title', 'author', 'date', 'subtitle'])

/** The prose words of `text`, with their offsets. */
export function proseWords(text: string): ProseWord[] {
  const chars = blankComments(text).split('')
  const blank = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < Math.min(to, chars.length); i++) if (chars[i] !== '\n') chars[i] = ' '
  }

  for (const r of findMathRegions(text)) blank(r.from, r.to)

  for (const m of text.matchAll(/\\begin\s*\{([^}]+)\}/g)) {
    const name = m[1].trim()
    if (!SKIP_ENVS.test(name)) continue
    const endTag = `\\end{${name}}`
    const end = text.indexOf(endTag, m.index! + m[0].length)
    blank(m.index!, end < 0 ? text.length : end + endTag.length)
  }

  // The preamble: all of it but the prose arguments of \title and the like.
  const begin = /^[^%\n]*\\begin\s*\{document\}/m.exec(text)
  const bodyStart = begin ? begin.index + begin[0].length : /\\documentclass/.test(text) ? text.length : 0
  const keep: [number, number][] = []
  if (bodyStart > 0) {
    for (const m of text.slice(0, bodyStart).matchAll(/\\([A-Za-z]+)\*?\s*(\[[^\]]*\])?\s*\{/g)) {
      if (!PREAMBLE_PROSE.has(m[1])) continue
      const open = m.index! + m[0].length - 1
      const close = closingBrace(text, open)
      if (close > open) keep.push([open + 1, close])
    }
    const saved = keep.map(([a, b]) => chars.slice(a, b))
    blank(0, bodyStart)
    keep.forEach(([a], i) => saved[i].forEach((c, k) => (chars[a + k] = c)))
  }

  // Commands: the name always; optional arguments always; mandatory ones per SKIP.
  const src = chars.join('')
  for (const m of src.matchAll(/\\(?:([A-Za-z@]+)\*?|.)/g)) {
    const start = m.index!
    let i = start + m[0].length
    blank(start, i)
    const name = m[1]
    if (!name) continue
    if (name === 'verb') {
      const delim = src[i]
      const end = delim ? src.indexOf(delim, i + 1) : -1
      blank(i, end < 0 ? i + 1 : end + 1)
      continue
    }
    if (name === 'def') {
      // \def\name#1{body}: all of it.
      const open = src.indexOf('{', i)
      const close = open < 0 ? -1 : closingBrace(src, open)
      if (close > 0 && src.slice(i, open).indexOf('\n\n') < 0) blank(i, close + 1)
      continue
    }
    let toSkip = SKIP[name] ?? 0
    for (let guard = 0; guard < 12; guard++) {
      const ws = /^[ \t]*\n?[ \t]*/.exec(src.slice(i, i + 40))![0]
      const at = i + ws.length
      if (src[at] === '[') {
        const close = src.indexOf(']', at)
        if (close < 0 || src.slice(at, close).includes('\n\n')) break
        blank(at, close + 1)
        i = close + 1
      } else if (src[at] === '{' && toSkip > 0) {
        const close = closingBrace(src, at)
        if (close < 0) break
        blank(at, close + 1)
        i = close + 1
        toSkip--
      } else break
    }
  }

  const masked = chars.join('')
  const out: ProseWord[] = []
  for (const m of masked.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
    const word = m[0]
    const from = m.index!
    const to = from + word.length
    if (word.length < 2 || /^[A-Z]{2,5}$/.test(word)) continue
    if (/\d/.test(text[from - 1] ?? '') || /\d/.test(text[to] ?? '')) continue
    out.push({ word, from, to })
  }
  return out
}
