import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { proseWords } from '../src/shared/spellwords'

const words = (text: string) => proseWords(text).map((w) => w.word)

describe('proseWords', () => {
  it('takes plain prose, with offsets', () => {
    const [w] = proseWords('  Helo there')
    expect(w).toEqual({ word: 'Helo', from: 2, to: 6 })
    expect(words("It's the students' work")).toEqual(["It's", 'the', 'students', 'work'])
  })

  it('leaves out math, comments and command names', () => {
    expect(words('Force $F = ma$ and \\[ E = mc^2 \\] ok % a comment')).toEqual(['Force', 'and', 'ok'])
    expect(words('\\textbf{Bold} \\emph{words} \\somemacro{arg}')).toEqual(['Bold', 'words', 'arg'])
  })

  it('leaves out arguments that are not prose', () => {
    expect(words('See \\ref{fig:velcoity} and \\cite{smith2020}.')).toEqual(['See', 'and'])
    expect(words('\\includegraphics[width=0.5\\linewidth]{Images/carthageLogo}')).toEqual([])
    expect(words('\\href{https://phet.colorado.edu}{the PhET site}')).toEqual(['the', 'PhET', 'site'])
    expect(words('\\begin{minipage}[t]{0.55\\linewidth} Text \\end{minipage}')).toEqual(['Text'])
    expect(words('\\SI{9.8}{\\meter\\per\\second} \\vspace{2em} done')).toEqual(['done'])
    expect(words('\\multicolumn{2}{c}{Header}')).toEqual(['Header'])
    expect(words('\\item[label] Item text')).toEqual(['Item', 'text'])
  })

  it('leaves out verbatim, TikZ and the preamble, but not the title', () => {
    const doc = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\newcommand{\\vv}[1]{\\vec{#1}}',
      '\\title{Hot wheels}',
      '\\begin{document}',
      'Body text \\verb|xyzzy| here.',
      '\\begin{verbatim}',
      'qwrty',
      '\\end{verbatim}',
      '\\begin{tikzpicture}\\draw (0,0) node {lbl};\\end{tikzpicture}',
      '\\end{document}',
    ].join('\n')
    expect(words(doc)).toEqual(['Hot', 'wheels', 'Body', 'text', 'here'])
  })

  it('checks table cells but not the column spec', () => {
    expect(words('\\begin{tabular}{lcr}\nMass & Speed \\\\\n\\end{tabular}')).toEqual(['Mass', 'Speed'])
  })

  it('skips acronyms, single letters and ordinals', () => {
    expect(words('NASA and a 2nd try, x-ray')).toEqual(['and', 'try', 'ray'])
  })

  it('finds only prose in a real handout', () => {
    const lab = readFileSync(resolve(import.meta.dirname, '../fixtures/vaults/1200-latex/Labs/Lab03_freeFall.tex'), 'utf8')
    const ws = new Set(words(lab))
    for (const bad of ['baselineskip', 'answerspace', 'hline', 'textbf', 'questions', 'linewidth', 'centering']) expect(ws.has(bad), bad).toBe(false)
    expect(ws.has('velocity')).toBe(true)
  })
})
