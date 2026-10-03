// The problem bank's pure logic: the comment header of a fragment, the
// "used in" index, cutting a \question out of a document, working out what a
// problem needs, and assembling the documents that preview or collect
// problems. No Node and no DOM, so both halves and the tests use it.
// Texts have \n line breaks (run `normalizeEol` first).
import type { PackageSpec } from '../../shared/packages'
import { usePackageLine } from '../../shared/packages'
import { blankComments, closingBrace, plain } from '../../shared/latexedit'
import { findMathRegions } from '../../shared/mathregions'
import { slugify } from '../../shared/paperedit'
import { dirOf, includeCandidates, joinRel, parseIncludes, type Include } from '../../shared/project'
import { normalizeEol } from '../../shared/search'

// ---------------------------------------------------------------- the header

export interface ProblemMeta {
  title: string
  tags: string[]
  /** 1 to 5, or null when unset. */
  difficulty: number | null
  source: string
  needs: PackageSpec[]
  /** One definition per entry (a \newcommand, \DeclareSIUnit, …). */
  preamble: string[]
}

export const emptyMeta = (): ProblemMeta => ({ title: '', tags: [], difficulty: null, source: '', needs: [], preamble: [] })

const KEY = /^[ \t]*%[ \t]*(problem|title|tags?|difficulty|source|needs|preamble)[ \t]*:[ \t]*(.*?)[ \t]*$/i

/** `siunitx, [T1]fontenc` as packages; options are in square brackets before the name. */
export function parseNeeds(value: string): PackageSpec[] {
  const out: PackageSpec[] = []
  for (const m of value.matchAll(/(?:\[([^\]]*)\])?\s*([A-Za-z0-9_-]+)/g)) out.push(m[1] ? { name: m[2], options: m[1].trim() } : m[2])
  return out
}

/** The inverse of `parseNeeds`. */
export const formatNeeds = (needs: PackageSpec[]): string => needs.map((p) => (typeof p === 'string' ? p : `[${p.options}]${p.name}`)).join(', ')

/** The name of a package spec. */
export const specName = (p: PackageSpec): string => (typeof p === 'string' ? p : p.name)

/**
 * A fragment split into its comment header and the problem. The header is
 * the run of `% key: value` lines at the top (comments of other kinds stay
 * with the body). Every field is optional.
 */
export function parseProblemHeader(text: string): { meta: ProblemMeta; body: string } {
  const meta = emptyMeta()
  const lines = normalizeEol(text).replace(/^﻿/, '').split('\n')
  const kept: string[] = []
  let i = 0
  for (; i < lines.length && /^[ \t]*%/.test(lines[i]); i++) {
    const m = KEY.exec(lines[i])
    if (!m) {
      kept.push(lines[i])
      continue
    }
    const value = m[2]
    switch (m[1].toLowerCase()) {
      case 'problem':
      case 'title':
        meta.title = value
        break
      case 'tag':
      case 'tags':
        meta.tags = [...new Set([...meta.tags, ...value.split(',').map((t) => t.trim()).filter(Boolean)])]
        break
      case 'difficulty': {
        const n = Math.round(Number.parseFloat(value))
        meta.difficulty = Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : null
        break
      }
      case 'source':
        meta.source = value
        break
      case 'needs':
        meta.needs = [...meta.needs, ...parseNeeds(value)]
        break
      case 'preamble':
        if (value) meta.preamble.push(value)
        break
    }
  }
  const body = [...kept, ...lines.slice(i)].join('\n').replace(/^\n+/, '').trimEnd()
  return { meta, body: body ? body + '\n' : '' }
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

/** A fragment's text: the header for the fields that are set, then the problem. */
export function serializeProblem(meta: Partial<ProblemMeta>, body: string): string {
  const head: string[] = []
  if (meta.title) head.push(`% problem: ${oneLine(meta.title)}`)
  if (meta.tags?.length) head.push(`% tags: ${meta.tags.join(', ')}`)
  if (meta.difficulty) head.push(`% difficulty: ${meta.difficulty}`)
  if (meta.source) head.push(`% source: ${oneLine(meta.source)}`)
  if (meta.needs?.length) head.push(`% needs: ${formatNeeds(meta.needs)}`)
  for (const p of meta.preamble ?? []) head.push(`% preamble: ${oneLine(p)}`)
  const text = normalizeEol(body).replace(/^\n+/, '').trimEnd() + '\n'
  return head.length ? `${head.join('\n')}\n${text}` : text
}

/** A title for a fragment with none: its file name, "projectile_off_a_cliff" → "Projectile off a cliff". */
export function titleFromName(name: string): string {
  const s = name.replace(/\.tex$/i, '').replace(/^.*[\\/]/, '').replace(/[_-]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : name
}

// ------------------------------------------------------------------- usage

/** The \input and \include commands of a file that are in effect. */
export const scanIncludes = (text: string): Include[] =>
  parseIncludes(normalizeEol(text)).filter((i) => !i.commented && (i.cmd === 'input' || i.cmd === 'include'))

/** The name `HW3` shown for `Homework/HW3.tex`. */
export const usageLabel = (rel: string): string => rel.replace(/^.*\//, '').replace(/\.tex$/i, '')

/**
 * Which files include each fragment. `fragments` are vault-relative paths;
 * `files` maps each other file to its includes. A path is looked for as TeX
 * would: from the including file's folder, then from the vault root.
 * Fragments with no users are mapped to [].
 */
export function usedIn(fragments: string[], files: Map<string, Include[]>): Map<string, string[]> {
  const byLower = new Map(fragments.map((f) => [f.toLowerCase(), f]))
  const out = new Map<string, Set<string>>(fragments.map((f) => [f, new Set()]))
  for (const [file, incs] of files) {
    const dir = dirOf(file)
    for (const inc of incs) {
      if (inc.commented) continue
      for (const c of includeCandidates(inc, dir, dir).candidates) {
        const hit = byLower.get(c.toLowerCase())
        if (hit) {
          out.get(hit)!.add(file)
          break
        }
      }
    }
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))]))
}

/** `usedIn` from the files' texts. */
export const usedInTexts = (fragments: string[], texts: Record<string, string>): Map<string, string[]> =>
  usedIn(fragments, new Map(Object.entries(texts).map(([rel, text]) => [rel, scanIncludes(text)])))

/** What `\input` names a vault-relative fragment: its path without .tex. */
export const inputArg = (rel: string): string => rel.replace(/\.tex$/i, '')

// ------------------------------------------------------------ definitions

export interface Definition {
  /** `\R` for a command, `proof` for an environment. */
  name: string
  env: boolean
  /** The whole definition on one line. */
  text: string
}

const DEFINERS =
  'newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|DeclareSIUnit|DeclarePairedDelimiter|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|NewDocumentEnvironment|newenvironment|renewenvironment|def|gdef'
const DEFINITION = new RegExp(`\\\\(${DEFINERS})(?![A-Za-z@])\\*?`, 'g')

/** The commands and environments `text` defines (\newcommand and friends), comments ignored. */
export function readDefinitions(source: string): Definition[] {
  const text = blankComments(source)
  const out: Definition[] = []
  for (const m of text.matchAll(DEFINITION)) {
    const kind = m[1]
    const env = /environment/i.test(kind)
    let pos = m.index! + m[0].length
    const ws = () => {
      while (pos < text.length && /\s/.test(text[pos])) pos++
    }
    const group = (): string | null => {
      ws()
      if (text[pos] !== '{') return null
      const close = closingBrace(text, pos)
      if (close < 0) return null
      const g = text.slice(pos + 1, close)
      pos = close + 1
      return g
    }
    const optional = () => {
      ws()
      if (text[pos] !== '[') return
      const close = text.indexOf(']', pos)
      if (close > 0) pos = close + 1
    }
    let name: string | null
    ws()
    if (kind === 'DeclareSIUnit') optional()
    ws()
    if (text[pos] === '{') name = group()?.trim() ?? null
    else {
      const bare = /^\\([A-Za-z@]+|.)/.exec(text.slice(pos))
      name = bare ? bare[0] : null
      if (bare) pos += bare[0].length
    }
    if (!name) continue
    let ok = true
    if (kind === 'def' || kind === 'gdef') {
      // \def\x#1#2{…}: parameters up to the body.
      while (pos < text.length && text[pos] !== '{' && text[pos] !== '\n') pos++
      ok = group() !== null
    } else if (env) {
      if (/Document/.test(kind)) ok = group() !== null && group() !== null && group() !== null
      else {
        optional()
        optional()
        ok = group() !== null && group() !== null
      }
    } else if (kind === 'DeclareMathOperator' || kind === 'DeclareSIUnit') ok = group() !== null
    else if (kind === 'DeclarePairedDelimiter') ok = group() !== null && group() !== null
    else if (/Document/.test(kind)) ok = group() !== null && group() !== null
    else {
      optional()
      optional()
      ok = group() !== null
    }
    if (!ok) continue
    out.push({ name: env ? name : name.startsWith('\\') ? name : `\\${name}`, env, text: oneLine(source.slice(m.index!, pos)) })
  }
  return out
}

/** Names of the commands (`\x`) and environments (`proof`) a text uses. */
export function usedNames(source: string): Set<string> {
  const text = blankComments(source)
  const names = new Set<string>()
  for (const m of text.matchAll(/\\([A-Za-z@]+)/g)) names.add(`\\${m[1]}`)
  for (const m of text.matchAll(/\\begin\s*\{([^}]+)\}/g)) names.add(m[1].trim())
  return names
}

/**
 * The definitions in `preamble` that `block` uses, directly or through
 * another definition, in the order they appear there.
 */
export function neededDefinitions(block: string, preamble: string): Definition[] {
  const defs = readDefinitions(preamble)
  const chosen = new Set<Definition>()
  const used = usedNames(block)
  for (let grew = true; grew; ) {
    grew = false
    for (const d of defs) {
      if (chosen.has(d) || !used.has(d.name)) continue
      chosen.add(d)
      grew = true
      for (const n of usedNames(d.text)) used.add(n)
    }
  }
  return defs.filter((d) => chosen.has(d))
}

// The packages that provide commands and environments (a small, obvious list).
const PACKAGE_COMMANDS: Record<string, string[]> = {
  siunitx: ['SI', 'si', 'num', 'SIrange', 'SIlist', 'qty', 'qtyrange', 'unit', 'ang', 'numrange', 'sisetup', 'DeclareSIUnit'],
  amsmath: ['dfrac', 'tfrac', 'binom', 'operatorname', 'DeclareMathOperator', 'substack', 'eqref', 'intertext', 'boldsymbol', 'text'],
  amssymb: ['mathbb', 'mathfrak', 'therefore', 'because', 'varnothing', 'lesssim', 'gtrsim', 'leqslant', 'geqslant', 'blacksquare'],
  mhchem: ['ce', 'pu'],
  graphicx: ['includegraphics', 'scalebox', 'rotatebox', 'resizebox'],
  xcolor: ['textcolor', 'colorbox', 'definecolor'],
  tikz: ['tikz', 'tikzset', 'usetikzlibrary'],
  booktabs: ['toprule', 'midrule', 'bottomrule', 'cmidrule'],
  cancel: ['cancel', 'bcancel', 'xcancel'],
  physics: ['pdv', 'dv', 'ket', 'bra', 'braket', 'expval'],
  multirow: ['multirow'],
}
const PACKAGE_ENVS: Record<string, string[]> = {
  amsmath: ['align', 'align*', 'gather', 'gather*', 'multline', 'alignat', 'flalign', 'split', 'cases', 'aligned', 'gathered', 'pmatrix', 'bmatrix', 'vmatrix', 'matrix'],
  tikz: ['tikzpicture'],
  pgfplots: ['axis'],
}

/** The packages loaded by `\usepackage` / `\RequirePackage` in `preamble`, with their options. */
export function usedPackages(preamble: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of blankComments(preamble).matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) {
    for (const name of m[2].split(',').map((s) => s.trim()).filter(Boolean)) out.set(name, m[1]?.trim() ?? out.get(name) ?? '')
  }
  return out
}

/**
 * What a question block needs: the packages for the commands it (and the
 * definitions it relies on) uses, with the options the source document
 * gives them, and the custom definitions from the source preamble.
 * A package is listed even if the source only gets it from its class;
 * adding it again later is harmless.
 */
export function detectNeeds(block: string, sourcePreamble: string): { needs: PackageSpec[]; preamble: string[] } {
  const defs = neededDefinitions(block, sourcePreamble)
  const text = [block, ...defs.map((d) => d.text)].join('\n')
  const names = usedNames(text)
  const loaded = usedPackages(sourcePreamble)
  const needs: PackageSpec[] = []
  const add = (pkg: string) => {
    if (needs.some((p) => specName(p) === pkg)) return
    const options = loaded.get(pkg)
    needs.push(options ? { name: pkg, options } : pkg)
  }
  for (const [pkg, cmds] of Object.entries(PACKAGE_COMMANDS)) if (cmds.some((c) => names.has(`\\${c}`))) add(pkg)
  for (const [pkg, envs] of Object.entries(PACKAGE_ENVS)) if (envs.some((e) => names.has(e))) add(pkg)
  return { needs, preamble: defs.map((d) => d.text) }
}

/** The definition lines of `lines` whose commands `docText` doesn't define yet. */
export function missingDefinitions(docText: string, lines: string[]): string[] {
  const have = new Set(readDefinitions(docText).map((d) => d.name))
  const blank = blankComments(docText)
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const defs = readDefinitions(line)
    const names = defs.map((d) => d.name)
    const already = defs.length ? names.some((n) => have.has(n) || seen.has(n)) : blank.includes(line)
    if (already) continue
    for (const n of names) seen.add(n)
    out.push(line)
  }
  return out
}

/** The change that puts definition `lines` just before \begin{document}; null with no such line. */
export function addToPreamble(docText: string, lines: string[]): { from: number; to: number; insert: string } | null {
  if (!lines.length) return null
  const m = /\\begin\s*\{document\}/.exec(blankComments(docText))
  if (!m) return null
  const lineStart = docText.lastIndexOf('\n', m.index - 1) + 1
  const atLineStart = /^[ \t]*$/.test(docText.slice(lineStart, m.index))
  const at = atLineStart ? lineStart : m.index
  return { from: at, to: at, insert: lines.join('\n') + (atLineStart ? '\n' : '\n\n') }
}

// ------------------------------------------------------------ question blocks

/**
 * The \question around `pos`: from its command to just before the next
 * \question, \end{questions} or \end{document}, trailing blank space
 * dropped. Null when `pos` isn't inside one.
 */
export function findQuestionBlock(text: string, pos: number): { from: number; to: number } | null {
  const blank = blankComments(text)
  const marks = [...blank.matchAll(/\\(?:titled)?question(?![A-Za-z@])|\\end\s*\{(?:questions|document)\}/g)].map((m) => ({
    at: m.index!,
    question: !m[0].startsWith('\\end'),
  }))
  let i = -1
  for (let k = 0; k < marks.length; k++) if (marks[k].question && marks[k].at <= pos) i = k
  if (i < 0) return null
  const next = marks[i + 1]
  if (next && next.at < pos) return null
  const end = next ? next.at : text.length
  const to = marks[i].at + text.slice(marks[i].at, end).trimEnd().length
  return { from: marks[i].at, to }
}

/** The block's text with the indentation it had in the document taken off its lines. */
export function dedentBlock(text: string, block: { from: number; to: number }): string {
  const lineStart = text.lastIndexOf('\n', block.from - 1) + 1
  const lead = text.slice(lineStart, block.from)
  const indent = /^[ \t]*$/.test(lead) ? lead.length : 0
  const lines = text.slice(block.from, block.to).split('\n')
  const strip = new RegExp(`^[ \\t]{0,${indent}}`)
  return lines.map((l, k) => (k === 0 ? l : l.replace(strip, ''))).join('\n')
}

/** A title for a question: its bold run-in heading, else its first words. */
export function guessTitle(block: string): string {
  const body = block.replace(/^\\(?:titled)?question(?:\[[^\]]*\])?(?:\{[^}]*\})?\s*/, '')
  const bold = /^\\textbf\{([^}]*)\}/.exec(body)
  if (bold) return plain(bold[1])
  return plain(body.split('\n')[0] ?? '')
}

/** The path for a new fragment titled `title` in `bank`, not among the `taken` ones. */
export function newFragmentPath(bank: string, title: string, taken: (rel: string) => boolean): string {
  const base = slugify(title)
  let rel = joinRel(bank, `${base}.tex`)
  for (let n = 2; taken(rel); n++) rel = joinRel(bank, `${base}_${n}.tex`)
  return rel
}

// ------------------------------------------------------------ documents

/** One problem to put in a built document. */
export interface DocEntry {
  /** `\input` this (a vault-relative path without .tex)… */
  arg?: string
  /** …or put this text in (a problem outside the vault). */
  inline?: string
  needs: PackageSpec[]
  preamble: string[]
}

/** A preamble file's text up to, not including, \begin{document}. */
export function preambleOnly(text: string): string {
  const m = /\\begin\s*\{document\}/.exec(blankComments(text))
  return (m ? text.slice(0, m.index) : text).trimEnd()
}

/**
 * A document holding the problems in a `questions` environment. Its
 * preamble is `preamble` (a file's text) or a bare `\documentclass`, plus
 * the packages and definitions the problems need that it lacks.
 */
export function buildDocument(o: { preamble: string | null; documentClass: string; entries: DocEntry[] }): string {
  let head = o.preamble !== null ? preambleOnly(normalizeEol(o.preamble)) : `\\documentclass{${o.documentClass || 'exam'}}`
  const have = usedPackages(head)
  const pkgs: PackageSpec[] = []
  for (const e of o.entries) for (const p of e.needs) if (!have.has(specName(p)) && !pkgs.some((q) => specName(q) === specName(p))) pkgs.push(p)
  const withPackages = [head, ...pkgs.map(usePackageLine)].join('\n')
  const defs = missingDefinitions(withPackages, o.entries.flatMap((e) => e.preamble))
  head = [withPackages, ...defs].join('\n')
  const body = o.entries.map((e) => (e.inline !== undefined ? e.inline.trimEnd() : `\\input{${e.arg}}`))
  return [head, '', '\\begin{document}', '\\begin{questions}', ...body.map((b) => `  ${b.replace(/\n/g, '\n  ')}`), '\\end{questions}', '\\end{document}', ''].join('\n')
}

// ------------------------------------------------------------ previews

export type PreviewSeg = { t: 'text'; s: string } | { t: 'math'; tex: string; display: boolean }

/** A stretch of the problem: the stem, or one part. */
export interface PreviewBlock {
  /** "(a)" for a part; null for the stem. */
  label: string | null
  segs: PreviewSeg[]
}

const SIUNITX_ARGS: Record<string, number> = { SI: 2, si: 1, num: 1, unit: 1, ang: 1, qty: 2, SIrange: 3, qtyrange: 3, numrange: 2, SIlist: 2 }

/** `text` as plain text and siunitx quantities (which are math to the renderer). */
function textSegs(text: string): PreviewSeg[] {
  const segs: PreviewSeg[] = []
  let last = 0
  for (const m of text.matchAll(/\\(SI|si|num|unit|ang|qty|SIrange|qtyrange|numrange|SIlist)(?![A-Za-z@])/g)) {
    if (m.index! < last) continue
    let pos = m.index! + m[0].length
    if (text[pos] === '[') pos = text.indexOf(']', pos) + 1 || pos
    let ok = true
    for (let k = 0; k < SIUNITX_ARGS[m[1]]; k++) {
      while (text[pos] === ' ') pos++
      const close = text[pos] === '{' ? closingBrace(text, pos) : -1
      if (close < 0) {
        ok = false
        break
      }
      pos = close + 1
    }
    if (!ok) continue
    if (m.index! > last) segs.push({ t: 'text', s: cleanText(text.slice(last, m.index)) })
    segs.push({ t: 'math', tex: text.slice(m.index, pos), display: false })
    last = pos
  }
  segs.push({ t: 'text', s: cleanText(text.slice(last)) })
  return segs.filter((s) => s.t === 'math' || s.s)
}

/** Takes the spaces off the ends of a block's text. */
function trimSegs(segs: PreviewSeg[]): PreviewSeg[] {
  const out = segs.map((s) => ({ ...s }))
  const first = out[0]
  if (first?.t === 'text') first.s = first.s.trimStart()
  const last = out[out.length - 1]
  if (last?.t === 'text') last.s = last.s.trimEnd()
  return out.filter((s) => s.t === 'math' || s.s)
}

const DROP_WITH_ARG = /\\(?:label|vspace|hspace|ref|eqref|cite|answerspace|points|bonuspoints|includegraphics|fillin|pagebreak|newpage|clearpage)\*?(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g

/** Readable text from running LaTeX (no math in it). */
function cleanText(s: string): string {
  let t = s
  for (let m = /\\footnote\s*\{/.exec(t); m; m = /\\footnote\s*\{/.exec(t)) {
    const close = closingBrace(t, m.index + m[0].length - 1)
    t = t.slice(0, m.index) + (close < 0 ? '' : t.slice(close + 1))
  }
  t = t.replace(DROP_WITH_ARG, ' ')
  for (let prev = ''; prev !== t; ) {
    prev = t
    t = t.replace(/\\(?:textbf|emph|textit|textsc|texttt|underline|textrm|textsf|text|mbox)\s*\{([^{}]*)\}/g, '$1')
  }
  return t
    .replace(/\\(?:ldots|dots)(?![A-Za-z@])/g, '…')
    .replace(/\\\\|\\newline/g, ' ')
    .replace(/\\([%&$#_{}])/g, '$1')
    .replace(/\\[ ,;!]|~/g, ' ')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\\[A-Za-z@]+\*?/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * The problem as blocks of readable text and math for a card: `\question`
 * and the parts' environments dropped, parts labelled (a), (b), …, and any
 * solution left out.
 */
export function previewBlocks(body: string): PreviewBlock[] {
  const src = blankComments(normalizeEol(body))
    .replace(/\\begin\s*\{solution\}[\s\S]*?\\end\s*\{solution\}/g, ' ')
    .replace(/\\begin\s*\{(?:parts|subparts|subsubparts|questions|choices|oneparchoices|checkboxes|oneparcheckboxes)\}|\\end\s*\{(?:parts|subparts|subsubparts|questions|choices|oneparchoices|checkboxes|oneparcheckboxes)\}/g, ' ')
    .replace(/^\s*\\(?:titled)?question(?:\[[^\]]*\])?(?:\{[^}]*\})?/, '')
  const out: PreviewBlock[] = []
  let part = 0
  let sub = 0
  const pieces = src.split(/(\\(?:part|subpart|choice|CorrectChoice)(?![A-Za-z@]))/)
  let label: string | null = null
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[k]
    if (k % 2 === 1) {
      if (piece === '\\part') {
        label = `(${String.fromCharCode(97 + (part++ % 26))})`
        sub = 0
      } else if (piece === '\\subpart') label = `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][sub++ % 10]})`
      else label = '•'
      continue
    }
    const segs: PreviewSeg[] = []
    let at = 0
    for (const r of findMathRegions(piece)) {
      if (!r.closed) continue
      if (r.from > at) segs.push(...textSegs(piece.slice(at, r.from)))
      segs.push({ t: 'math', tex: r.tex, display: r.display })
      at = r.to
    }
    segs.push(...textSegs(piece.slice(at)))
    const trimmed = trimSegs(segs)
    if (trimmed.length) out.push({ label, segs: trimmed })
    label = null
  }
  return out
}

/** The text of a problem to search through: its readable words, math as written. */
export function searchableText(body: string): string {
  return previewBlocks(body)
    .map((b) => b.segs.map((s) => (s.t === 'text' ? s.s : s.tex)).join(' '))
    .join(' ')
}

// ------------------------------------------------------------ the index

/** A problem as the view shows it. */
export interface Fragment extends ProblemMeta {
  /** Vault-relative path; `lib:<path>` for the shared library. */
  id: string
  /** The file stem. */
  name: string
  /** In the shared library rather than the vault. */
  library: boolean
  /** What `\input` names it; null for a library problem. */
  arg: string | null
  /** The problem text without its header. */
  body: string
  /** Files that include it (vault-relative). */
  usedIn: string[]
  /** Last change, to tell a stale check result. */
  mtime: number
}

/** How a problem goes into a built document. */
export function entryFor(f: Pick<Fragment, 'arg' | 'body' | 'needs' | 'preamble'>): DocEntry {
  return f.arg !== null ? { arg: f.arg, needs: f.needs, preamble: f.preamble } : { inline: f.body, needs: f.needs, preamble: f.preamble }
}

/** What to put in the document for a problem, by insert mode. Library problems are always copied. */
export function insertText(f: Pick<Fragment, 'arg' | 'body'>, mode: 'input' | 'copy'): string {
  return mode === 'input' && f.arg !== null ? `\\input{${f.arg}}` : f.body.trimEnd()
}

/** Builds a fragment from its file's text. */
export function makeFragment(id: string, text: string, o: { library: boolean; usedIn?: string[]; mtime?: number }): Fragment {
  const { meta, body } = parseProblemHeader(text)
  const name = id.replace(/^.*\//, '').replace(/\.tex$/i, '')
  return {
    ...meta,
    title: meta.title || titleFromName(name),
    id,
    name,
    library: o.library,
    arg: o.library ? null : inputArg(id),
    body,
    usedIn: o.usedIn ?? [],
    mtime: o.mtime ?? 0,
  }
}

/** One problem's check: did its wrapper document build. */
export interface CheckResult {
  ok: boolean
  /** Why not: the build's errors, at most five. */
  errors: { title: string; line: number | null; file: string | null }[]
  /** The problem's `mtime` when it was checked; a changed file makes the result stale. */
  mtime: number
}

/** What the main half's `index` handler returns. */
export interface BankIndex {
  fragments: Fragment[]
  checks: Record<string, CheckResult>
  /** The bank folder (vault-relative). */
  bank: string
  /** The bank has a _preamble.tex. */
  hasPreamble: boolean
}

/** What a problem needs, for a card: "siunitx, [T1]fontenc, \solarmass". */
export function needsSummary(f: Pick<Fragment, 'needs' | 'preamble'>): string {
  return [formatNeeds(f.needs), ...f.preamble.flatMap((l) => readDefinitions(l).map((d) => d.name))].filter(Boolean).join(', ')
}
