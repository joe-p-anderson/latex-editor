// Brackets and quotes that understand LaTeX, as pure text logic:
//  - \left( adds \right) (and \left[, \left|, \left., \left\{, \left\langle, …);
//  - \{ adds \}, \( adds \), \[ adds \]; in math \langle adds \rangle and so on;
//  - ) or ] typed just before an added \right) steps over it;
//  - `` adds '' in text, and '' typed before an added '' steps over it;
//  - " in text becomes `` or '' by position (smart quotes);
//  - Backspace inside an empty pair removes both halves.
// Also the \left/\right pairing used for highlighting and jumping.
import { blankComments, envStackAt, envTokens } from './latexedit'
import { findMathRegions, mathAtCursor } from './mathregions'

/** Where the cursor is, as far as pairing cares. */
export interface PairContext {
  math: boolean
  /** Prose: not math, a comment, the preamble, verbatim, or an argument like \label{…} or \url{…}. */
  text: boolean
}

/**
 * A change around the cursor: replace [pos + from, pos + to) with `insert`
 * and put the cursor at pos + from + cursor. `from` ≤ 0 ≤ `to`.
 */
export interface PairEdit {
  from: number
  to: number
  insert: string
  cursor: number
}

// \left delimiter → its \right partner.
const DELIMS: [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['|', '|'],
  ['.', '.'],
  ['\\{', '\\}'],
  ['\\|', '\\|'],
  ['\\langle', '\\rangle'],
  ['\\lvert', '\\rvert'],
  ['\\lVert', '\\rVert'],
  ['\\lfloor', '\\rfloor'],
  ['\\lceil', '\\rceil'],
]
const CLOSER = new Map(DELIMS)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DELIM_SRC = DELIMS.map(([o]) => esc(o) + (/[a-zA-Z]$/.test(o) ? '(?![A-Za-z])' : '')).join('|')
const LEFT_AT_END = new RegExp(`\\\\left\\s*(${DELIMS.map(([o]) => esc(o)).join('|')})$`)
// Openers that pair on their own in math (not after \left).
const MATH_OPENERS: Record<string, string> = { '\\langle': '\\rangle', '\\lvert': '\\rvert', '\\lVert': '\\rVert', '\\lfloor': '\\rfloor', '\\lceil': '\\rceil' }

/** True when the text ends in an odd number of backslashes, so the next character is escaped. */
const escapes = (before: string) => /(^|[^\\])(\\\\)*\\$/.test(before)

/**
 * What typing `ch` should do, given the text before and after the cursor on
 * its line; null to type it normally.
 */
export function pairOnInput(before: string, after: string, ch: string, ctx: PairContext): PairEdit | null {
  const typed = before + ch

  // \left<delim> → \left<delim>|\right<partner>
  if (ctx.math) {
    const m = LEFT_AT_END.exec(typed)
    // A letter delimiter (\langle) pairs only once it's complete.
    if (m && !(/[a-zA-Z]$/.test(ch) && /^[a-zA-Z]/.test(after)) && !/^\s*\\right/.test(after)) {
      return { from: 0, to: 0, insert: `${ch}\\right${CLOSER.get(m[1])}`, cursor: 1 }
    }
    for (const [open, close] of Object.entries(MATH_OPENERS)) {
      if (typed.endsWith(open) && !/[a-zA-Z]/.test(after[0] ?? '') && !after.startsWith(close) && !/\\left\s*$/.test(typed.slice(0, -open.length))) {
        return { from: 0, to: 0, insert: ch + close, cursor: 1 }
      }
    }
    // ) or ] just before an added \right) steps over it.
    for (const [open, close] of DELIMS) {
      if (open.length === 1 && ch === close && open !== close && after.startsWith(`\\right${close}`)) {
        return { from: 0, to: 0, insert: '', cursor: 6 + close.length }
      }
    }
  }

  // \{ → \{|\}, and \( → \(|\) or \[ → \[|\] in text.
  if (escapes(before)) {
    if (ch === '{' && !after.startsWith('\\}')) return { from: 0, to: 0, insert: '{\\}', cursor: 1 }
    if ((ch === '(' || ch === '[') && !ctx.math && ctx.text) {
      const close = ch === '(' ? '\\)' : '\\]'
      if (!after.startsWith(close)) return { from: 0, to: 0, insert: ch + close, cursor: 1 }
    }
    return null
  }

  if (!ctx.text) return null

  // `` → ``|''
  if (ch === '`' && before.endsWith('`') && !before.endsWith('``') && !after.startsWith("''")) {
    return { from: 0, to: 0, insert: "`''", cursor: 1 }
  }
  // Closing '' typed over an added '': step over it.
  if (ch === "'" && before.endsWith("'") && !before.endsWith("''") && after.startsWith("''")) {
    return { from: -1, to: 2, insert: "''", cursor: 2 }
  }
  // Smart quotes.
  if (ch === '"') {
    const opening = before === '' || /[\s(\[{~]$/.test(before)
    return { from: 0, to: 0, insert: opening ? '``' : "''", cursor: 2 }
  }
  return null
}

/** Backspace inside an empty pair: remove both halves; null for a normal backspace. */
export function pairOnBackspace(before: string, after: string): PairEdit | null {
  const left = new RegExp(`\\\\left\\s*(${DELIM_SRC})$`).exec(before)
  if (left) {
    const close = `\\right${CLOSER.get(left[1])}`
    if (after.startsWith(close)) return { from: -left[0].length, to: close.length, insert: '', cursor: 0 }
  }
  for (const [open, close] of [['\\{', '\\}'], ['\\(', '\\)'], ['\\[', '\\]'], ['``', "''"], ...Object.entries(MATH_OPENERS)]) {
    if (!before.endsWith(open) || !after.startsWith(close)) continue
    // \{ must be the escape itself, not the end of \\{ (a line break then a group).
    if (open.startsWith('\\') && !escapes(before.slice(0, -open.length + 1))) continue
    return { from: -open.length, to: close.length, insert: '', cursor: 0 }
  }
  return null
}

// Commands whose argument isn't prose: no smart quotes or `` pairs inside.
const RAW_ARGS = /\\(label|ref|eqref|cref|Cref|pageref|autoref|url|href|input|include|includegraphics|usepackage|documentclass|cite\w*|begin|end|verb)\*?\s*(\[[^\]]*\])?\s*$/

/** The pairing context at `pos` in the whole document. */
export function pairContext(text: string, pos: number): PairContext {
  if (mathAtCursor(text, findMathRegions(text), pos)) return { math: true, text: false }
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  const line = text.slice(lineStart, pos)
  const comment = /(^|[^\\])(\\\\)*%/.test(line)
  const begin = /^[^%\n]*\\begin\s*\{document\}/m.exec(text)
  const preamble = begin ? pos < begin.index : /\\documentclass/.test(text.slice(0, pos))
  const verbatim = envStackAt(envTokens(text.slice(0, pos)), pos).some((t) => /^(verbatim|Verbatim|lstlisting|minted|comment)\*?$/.test(t.name))
  return { math: false, text: !comment && !preamble && !verbatim && !inRawArg(text, pos) }
}

/** Inside the argument of \label, \url, \ref and the like. */
function inRawArg(text: string, pos: number): boolean {
  let depth = 0
  for (let i = pos - 1; i >= 0 && i > pos - 2000; i--) {
    const c = text[i]
    if (c === '\n' && text[i - 1] === '\n') return false // a paragraph break: no argument spans it
    if ((c !== '{' && c !== '}') || escapes(text.slice(Math.max(0, i - 8), i))) continue
    if (c === '}') depth++
    else if (depth > 0) depth--
    else return RAW_ARGS.test(text.slice(Math.max(0, i - 60), i))
  }
  return false
}

// ---------------------------------------------------------------------------
// \left … \right pairs

export interface LeftRight {
  /** The \left and its delimiter, e.g. `\left(` or `\left\langle`. */
  open: { from: number; to: number }
  close: { from: number; to: number }
}

/** Every matched \left … \right pair in the document (comments ignored). */
export function leftRightPairs(text: string): LeftRight[] {
  const src = blankComments(text)
  const out: LeftRight[] = []
  const stack: { from: number; to: number }[] = []
  const re = new RegExp(`\\\\(left|right)(?![A-Za-z])\\s*(${DELIM_SRC}|\\\\[A-Za-z]+|\\S)?`, 'g')
  for (const m of src.matchAll(re)) {
    const tok = { from: m.index!, to: m.index! + m[0].length }
    if (m[1] === 'left') stack.push(tok)
    else {
      const open = stack.pop()
      if (open) out.push({ open, close: tok })
    }
  }
  return out
}
