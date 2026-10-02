import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { includeCandidates, magicRoot, paperFiles, parseIncludes, rootComment } from '../src/shared/project'
import { PaperModel } from '../src/shared/papermodel'
import { freshCounters, liveModel } from '../src/shared/livemodel'
import { sectionDocument } from '../src/shared/sectiondoc'
import { DEFAULT_LISTS } from '../src/shared/latexedit'

const VAULT = resolve(import.meta.dirname, '../fixtures/vaults/AngStatsRevTex')
/** The 1-based line of a fixture file that contains `needle`. */
const lineOf = (file: string, needle: string) => readFileSync(resolve(VAULT, file), 'utf8').split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1

describe('parseIncludes', () => {
  it('finds each kind of include, with its line and span', () => {
    const text = [
      '\\input{intro}',
      'text \\include{chap/one} more \\input appendix',
      '\\subfile{parts/x.tex}',
      '\\import{figs/}{plot} \\subimport*{deep/}{y}',
      '\\includegraphics{no} \\inputencoding{latin1} \\includeonly{no}',
    ].join('\n')
    const incs = parseIncludes(text)
    expect(incs.map((i) => [i.cmd, i.dir, i.arg, i.line, i.commented])).toEqual([
      ['input', '', 'intro', 1, false],
      ['include', '', 'chap/one', 2, false],
      ['input', '', 'appendix', 2, false],
      ['subfile', '', 'parts/x.tex', 3, false],
      ['import', 'figs/', 'plot', 4, false],
      ['subimport', 'deep/', 'y', 4, false],
    ])
    expect(text.slice(incs[1].from, incs[1].to)).toBe('\\include{chap/one}')
  })

  it('keeps a commented-out include line, but not includes inside other comments', () => {
    const text = 'a\r\n  %% \\input{off}\r\nx % see \\input{mention}\r\n\\% \\input{real}\r\n'
    const incs = parseIncludes(text)
    expect(incs.map((i) => [i.arg, i.line, i.commented])).toEqual([
      ['off', 2, true],
      ['real', 4, false],
    ])
    expect(text.slice(incs[0].from, incs[0].to)).toBe('%% \\input{off}')
  })
})

describe('resolution', () => {
  const inc = (s: string) => parseIncludes(s)[0]
  it('tries the import base, the root folder, then the vault root', () => {
    expect(includeCandidates(inc('\\input{a}'), 'paper', 'paper').candidates).toEqual(['paper/a.tex', 'a.tex'])
    expect(includeCandidates(inc('\\input{a.cls}'), '', '').candidates).toEqual(['a.cls'])
    expect(includeCandidates(inc('\\include{a.b}'), 'p', 'p').candidates[0]).toBe('p/a.b.tex')
    expect(includeCandidates(inc('\\subimport{sec/}{a}'), 'p', 'p/ch').candidates).toEqual(['p/ch/sec/a.tex'])
    expect(includeCandidates(inc('\\import{../x/}{a}'), 'p', 'p/ch')).toEqual({ candidates: ['x/a.tex'], base: 'x' })
  })

  it('writes and reads % !TEX root', () => {
    expect(rootComment('intro.tex', 'main.tex')).toBe('% !TEX root = main.tex')
    expect(rootComment('paper/sec/intro.tex', 'paper/main.tex')).toBe('% !TEX root = ../main.tex')
    expect(rootComment('other/x.tex', 'paper/main.tex')).toBe('% !TEX root = ../paper/main.tex')
    expect(magicRoot('paper/sec/intro.tex', '% !TEX root = ../main.tex\n')).toBe('paper/main.tex')
  })
})

describe('paperFiles', () => {
  it('lists the fixture paper in reading order', async () => {
    const read = async (rel: string) => readFileSync(resolve(VAULT, rel), 'utf8')
    const exists = (rel: string) => existsSync(resolve(VAULT, rel))
    const { files, texts } = await paperFiles('main.tex', read, exists)
    expect(files.map((f) => f.rel)).toEqual([
      'main.tex',
      '1_Intro.tex',
      '2_full_description.tex',
      '3_reduced.tex',
      '4_calculation.tex',
      '5_Results.tex',
      '67_discussionconclusion.tex',
      'A_Appendices.tex',
    ])
    expect(files.every((f) => f.exists && !f.off)).toBe(true)
    expect(files[3]).toMatchObject({ parent: 'main.tex', depth: 1, include: { line: lineOf('main.tex', '\\input{3_reduced}') } })
    expect(texts.size).toBe(8)
  })

  it('nests, marks what is switched off, survives cycles and missing files', async () => {
    const fs: Record<string, string> = {
      'p/main.tex': '\\documentclass{article}\n\\input{a}\n% \\input{b}\n\\input{gone}',
      'p/a.tex': '\\input{sub/c}\n\\input{main}',
      'p/b.tex': '\\input{sub/c}\n\\input{d}',
      'p/sub/c.tex': 'c',
      'p/d.tex': 'd',
    }
    const { files } = await paperFiles('p/main.tex', async (r) => fs[r] ?? null, (r) => r in fs)
    expect(files.map((f) => [f.rel, f.depth, f.off, f.exists])).toEqual([
      ['p/main.tex', 0, false, true],
      ['p/a.tex', 1, false, true],
      ['p/sub/c.tex', 2, false, true],
      ['p/b.tex', 1, true, true],
      ['p/d.tex', 2, true, true],
      ['p/gone.tex', 1, false, false],
    ])
  })
})

describe('PaperModel', () => {
  const load = async () => {
    const read = async (rel: string) => readFileSync(resolve(VAULT, rel), 'utf8').replace(/\r\n/g, '\n')
    const { files, texts } = await paperFiles('main.tex', read, (rel) => existsSync(resolve(VAULT, rel)))
    return new PaperModel('main.tex', files, (rel) => texts.get(rel) ?? null, DEFAULT_LISTS)
  }

  it('numbers each file from where the one before it ended, as revtex does', async () => {
    const m = await load()
    expect(m.style).toBe('revtex')
    expect(['1_Intro.tex', '3_reduced.tex', '67_discussionconclusion.tex', 'A_Appendices.tex'].map((f) => m.sectionsOf(f))).toEqual(['I', 'III', 'VI–VII', 'A–B'])
    const disc = m.files.get('67_discussionconclusion.tex')!.headings
    expect(disc.slice(0, 2).map((h) => [h.number, h.ref])).toEqual([['VI', 'VI'], ['A', 'VI A']])
    expect(m.files.get('A_Appendices.tex')!.headings[0].number).toBe('Appendix A')
    // Equations run on across files, and start again as A1 in the appendix.
    const intro = m.files.get('2_full_description.tex')!
    expect(m.files.get('3_reduced.tex')!.start.equation).toBe(intro.end.equation)
    expect(m.labels.get('eq:MainAv')).toMatchObject({ kind: 'equation', file: 'A_Appendices.tex', line: lineOf('A_Appendices.tex', '\\label{eq:MainAv}') })
    // The first equation of the second appendix.
    expect(m.labels.get('eq:MainAv')!.number).toBe('B1')
    expect(m.labels.get('sec:3_reduced_descriptions')).toMatchObject({ number: 'III', file: '3_reduced.tex' })
    // As LaTeX numbered them in a real build of this paper (its main.aux).
    const built = { 'eq:orientationDef': '5a', 'eq:orientationExponential': '6', 'eq:1circavAltens': '35e', 'eq:12_dirac_alignment': '46c', 'eq:18_loctoglobclos': '66', 'applicability-of-results': 'VI A', 'fig:reactionmaps': '6', 'eq:19_gamma_int1': 'B10b', 'eq:19_gamma_int2': 'B12' }
    for (const [key, number] of Object.entries(built)) expect([key, m.labels.get(key)?.number]).toEqual([key, number])
  })

  it('gives a file the counters, style, includes and labels it needs in the live view', async () => {
    const m = await load()
    const text = readFileSync(resolve(VAULT, '3_reduced.tex'), 'utf8').replace(/\r\n/g, '\n')
    const live = liveModel(text, DEFAULT_LISTS, m.options('3_reduced.tex'))
    const first = live.nodes.find((n) => n.kind === 'heading')!
    expect(first).toMatchObject({ number: 'III' })
    // A ref to a label in another file resolves.
    const withRef = liveModel(`${text}\nsee \\ref{sec:2_localcollections}`, DEFAULT_LISTS, m.options('3_reduced.tex'))
    expect(withRef.nodes.findLast((n) => n.kind === 'ref')).toMatchObject({ text: 'II' })
    // main.tex: each \input moves the counters on by what its file holds.
    const main = readFileSync(resolve(VAULT, 'main.tex'), 'utf8').replace(/\r\n/g, '\n')
    const root = liveModel(main, DEFAULT_LISTS, m.options('main.tex'))
    expect(root.nodes.filter((n) => n.kind === 'include')).toHaveLength(7)
    expect(root.end.sec[1]).toBe(m.files.get('A_Appendices.tex')!.end.sec[1])
  })
})

describe('sectionDocument', () => {
  it('keeps the preamble and one include, sets the counters, and keeps line numbers', () => {
    const root = ['\\documentclass{revtex4-2}', '\\begin{document}', '\\maketitle', '\\input{1_a}', '  \\input{2_b}', '\\bibliography{x}', '\\end{document}', ''].join('\n')
    const start = { ...freshCounters(), sec: [0, 1, 2, 0], equation: 7, figure: 1 }
    const doc = sectionDocument(root, 5, start)!
    const lines = doc.split('\n')
    expect(lines).toHaveLength(8)
    expect(lines.slice(0, 2)).toEqual(['\\documentclass{revtex4-2}', '\\begin{document}'])
    expect(lines[2]).toBe('')
    expect(lines[3]).toBe('')
    expect(lines[4]).toBe('\\setcounter{section}{1}\\setcounter{subsection}{2}\\setcounter{subsubsection}{0}\\setcounter{equation}{7}\\setcounter{figure}{1}\\setcounter{table}{0}\\input{2_b}')
    expect(lines[5]).toBe('')
    expect(lines[6]).toBe('\\end{document}')
    expect(sectionDocument(root, 1, start)).toBeNull()
  })

  it('starts an appendix with \\appendix', () => {
    const root = '\\begin{document}\n\\input{app}\n\\end{document}'
    expect(sectionDocument(root, 2, { ...freshCounters(), appendix: true })!.split('\n')[1]).toMatch(/^\\appendix\\setcounter\{section\}\{0\}/)
  })
})
