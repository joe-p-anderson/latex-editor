// What the editor's live mode shows in place of the source: headings, list
// markers, rendered math, figures, tables, label and ref chips, and small
// typographic replacements. One pass over the document finds each construct
// and works out the numbers LaTeX would give it (sections, equations,
// figures, list items, and exam questions, whose counter is document-global
// in handout.cls). Kept free of CodeMirror so it can be unit tested.
//
// Offsets are into the document text as CodeMirror sees it (one character per
// line break), so callers pass state.doc.toString().
import { blankComments, closingBrace, envTokens, matchEnd, type EnvToken } from './latexedit'
import { findMathRegions } from './mathregions'

export type ItemStyle = 'bullet' | 'number' | 'term' | 'box'

export interface TableCell {
  tex: string
  span: number
  align: 'l' | 'c' | 'r'
}

export interface TableRow {
  cells: TableCell[]
  /** An \hline (or \toprule, \midrule, …) above this row. */
  ruleAbove: boolean
}

export interface Tabular {
  cols: ('l' | 'c' | 'r')[]
  /** Vertical rules: vlines[i] is the rule left of column i (vlines[cols.length] is the right edge). */
  vlines: boolean[]
  rows: TableRow[]
  /** A rule under the last row. */
  ruleBelow: boolean
}

export type LiveNode =
  | { kind: 'preamble'; from: number; to: number; docclass: string | null; packages: number; macros: number }
  | {
      kind: 'heading'
      from: number
      to: number
      level: 1 | 2 | 3
      /** End of `\section{` (the title starts here); -1 when the title isn't closed. */
      openTo: number
      /** The title's closing brace. */
      closeFrom: number
      number: string | null
    }
  | { kind: 'fence'; from: number; to: number; env: string; begin: boolean }
  | { kind: 'item'; from: number; to: number; env: string; depth: number; label: string; style: ItemStyle; points: string | null; correct: boolean }
  | { kind: 'math'; from: number; to: number; tex: string; display: boolean; env: string | null }
  | { kind: 'figure'; from: number; to: number; images: string[]; caption: string | null; number: string | null; labels: string[] }
  | { kind: 'table'; from: number; to: number; tabular: Tabular | null; caption: string | null; number: string | null; labels: string[] }
  | { kind: 'verbatim'; from: number; to: number }
  | { kind: 'image'; from: number; to: number; path: string }
  | { kind: 'format'; from: number; to: number; cmd: string; openTo: number; closeFrom: number }
  | { kind: 'label'; from: number; to: number; key: string }
  | { kind: 'ref'; from: number; to: number; cmd: string; keys: string[]; text: string | null }
  | { kind: 'symbol'; from: number; to: number; text: string; faint: boolean }

export type LabelKind = 'section' | 'equation' | 'figure' | 'table' | 'question' | 'item'

export interface LabelTarget {
  number: string
  kind: LabelKind
  /** Offset of the \label. */
  pos: number
}

export interface LiveModel {
  nodes: LiveNode[]
  /** List environment bodies (between \begin and \end), with how deeply nested they are (1 = outermost). */
  lists: { from: number; to: number; depth: number }[]
  labels: Map<string, LabelTarget>
}

const SECTION_LEVEL: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 }
const FORMAT = /^(textbf|textit|emph|underline|texttt|textsc|textsf|textsl|textup)$/
const REFS = /^(ref|eqref|cref|Cref|autoref|pageref|nameref|[Cc]ite[a-zA-Z]*|parencite|textcite|autocite|footcite|smartcite|supercite|nocite)$/
/** Whether a ref-like command is a citation (its keys are bibliography keys, not labels). */
export const isCite = (cmd: string) => /cite/i.test(cmd)
const SIUNITX: Record<string, number> = { SI: 2, qty: 2, si: 1, unit: 1, num: 1, ang: 1, SIrange: 3, qtyrange: 3, numrange: 2 }
const VERBATIM = /^(verbatim|Verbatim|lstlisting|minted|comment)\*?$/
const FIGURES = /^(figure|wrapfigure|SCfigure)\*?$/
const TABLES = /^(table|wraptable)\*?$/
const TABULARS = /^(tabular|tabularx|tabular\*|longtable)$/
const NUMBERED_MATH = /^(equation|align|gather|multline|flalign|alignat|eqnarray)$/
const SYMBOLS: Record<string, string> = { ldots: '…', dots: '…', textdegree: '°', LaTeX: 'LaTeX', TeX: 'TeX', textendash: '–', textemdash: '—' }
const ESCAPES: Record<string, string> = { '%': '%', '&': '&', $: '$', '#': '#', _: '_', '{': '{', '}': '}' }

const alpha = (n: number) => (n >= 1 && n <= 26 ? String.fromCharCode(96 + n) : String(n))
const roman = (n: number) => {
  const r: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let s = ''
  for (const [v, d] of r) for (; n >= v; n -= v) s += d
  return s
}

interface OpenList {
  env: string
  marker: string
  count: number
  /** Nesting among lists of any kind, 1 = outermost. */
  depth: number
  /** Nesting among enumerates / itemizes, for their label styles. */
  enumDepth: number
  itemDepth: number
  bodyFrom: number
}

/**
 * The live-mode constructs in `text`. `lists` maps list environments to their
 * item command without the backslash, e.g. { itemize: 'item', questions: 'question' }.
 */
export function liveModel(text: string, lists: Record<string, string>): LiveModel {
  const src = blankComments(text)
  const nodes: LiveNode[] = []
  const listBodies: LiveModel['lists'] = []
  const labels = new Map<string, LabelTarget>()
  const tokens = envTokens(text)
  const tokenAt = new Map<number, EnvToken>(tokens.map((t) => [t.from, t]))
  const math = findMathRegions(text)
  let mi = 0

  // The counters LaTeX keeps.
  const sec = [0, 0, 0, 0] // chapter, section, subsection, subsubsection
  let hasChapters = false
  let equation = 0
  let figure = 0
  let table = 0
  let question = 0
  /** What a \label here would refer to (LaTeX's \@currentlabel). */
  let current = null as { number: string; kind: LabelKind } | null
  const stack: OpenList[] = []
  const headings: { node: Extract<LiveNode, { kind: 'heading' }>; level: number }[] = []

  // The preamble: everything up to \begin{document}.
  let start = 0
  const doc = tokens.find((t) => t.kind === 'begin' && t.name === 'document')
  if (doc) {
    const pre = src.slice(0, doc.from)
    const cls = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(pre)
    let packages = 0
    for (const m of pre.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) packages += m[1].split(',').filter((s) => s.trim()).length
    const macros = [...pre.matchAll(/\\(?:newcommand|renewcommand|providecommand|def|DeclareMathOperator|newenvironment|DeclareSIUnit)(?![A-Za-z])/g)].length
    nodes.push({ kind: 'preamble', from: 0, to: doc.to, docclass: cls ? cls[1].trim() : null, packages, macros })
    start = doc.to
  }

  const re = /\\([A-Za-z@]+)(\*?)|\\([^A-Za-z@\s])|---?|``|''|~/g
  re.lastIndex = start
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const p = m.index
    // Math: rendered whole, never scanned inside.
    while (mi < math.length && math[mi].to <= p) mi++
    const region = math[mi]
    if (region && region.from <= p && p < region.to) {
      re.lastIndex = Math.max(region.to, p + 1)
      continue
    }
    const end = p + m[0].length
    const name = m[1]
    if (name === undefined) {
      if (m[3] !== undefined) {
        if (m[3] in ESCAPES) nodes.push({ kind: 'symbol', from: p, to: end, text: ESCAPES[m[3]], faint: false })
        else if (m[3] === '\\') nodes.push({ kind: 'symbol', from: p, to: end, text: '↵', faint: true })
        else if (m[3] === ',') nodes.push({ kind: 'symbol', from: p, to: end, text: ' ', faint: false })
        continue
      }
      const t = m[0]
      const sym = t === '---' ? '—' : t === '--' ? '–' : t === '``' ? '“' : t === "''" ? '”' : ' '
      nodes.push({ kind: 'symbol', from: p, to: end, text: sym, faint: t === '~' })
      continue
    }
    const star = m[2]

    if (name === 'begin' || name === 'end') {
      const tok = tokenAt.get(p)
      if (!tok) continue
      re.lastIndex = tok.to
      if (tok.kind === 'begin') beginEnv(tok)
      else endEnv(tok)
      continue
    }

    if (name in SECTION_LEVEL) {
      heading(name, star === '*', p, end)
      continue
    }

    const top = stack[stack.length - 1]
    if (top && (name === top.marker || (top.marker === 'choice' && name === 'CorrectChoice'))) {
      item(top, name, p, end)
      continue
    }

    if (name === 'resetquestions') {
      question = 0
      continue
    }

    if (FORMAT.test(name) && src[end] === '{') {
      const close = closingBrace(src, end)
      if (close < 0) continue
      nodes.push({ kind: 'format', from: p, to: close + 1, cmd: name, openTo: end + 1, closeFrom: close })
      re.lastIndex = end + 1 // the content is scanned as usual
      continue
    }

    if (name === 'label') {
      const g = group(end)
      if (!g) continue
      const key = g.body.trim()
      nodes.push({ kind: 'label', from: p, to: g.end, key })
      if (current) labels.set(key, { ...current, pos: p })
      re.lastIndex = g.end
      continue
    }

    if (REFS.test(name)) {
      let j = end
      for (let o = optional(j); o; o = optional(j)) j = o.end // \cite[p.~4]{key}
      const g = group(j)
      if (!g) continue
      const keys = g.body.split(',').map((k) => k.trim()).filter(Boolean)
      nodes.push({ kind: 'ref', from: p, to: g.end, cmd: name, keys, text: null })
      re.lastIndex = g.end
      continue
    }

    if (name === 'includegraphics') {
      const o = optional(end)
      const g = group(o ? o.end : end)
      if (!g) continue
      nodes.push({ kind: 'image', from: p, to: g.end, path: g.body.trim() })
      re.lastIndex = g.end
      continue
    }

    if (name in SIUNITX) {
      let j = end
      const o = optional(j)
      if (o) j = o.end
      let ok = true
      for (let k = 0; k < SIUNITX[name] && ok; k++) {
        const g = group(j)
        if (g) j = g.end
        else ok = false
      }
      if (!ok) continue
      nodes.push({ kind: 'math', from: p, to: j, tex: text.slice(p, j), display: false, env: null })
      re.lastIndex = j
      continue
    }

    if (name in SYMBOLS) {
      const to = src.startsWith('{}', end) ? end + 2 : end
      nodes.push({ kind: 'symbol', from: p, to, text: SYMBOLS[name], faint: false })
      re.lastIndex = to
    }
  }

  // Math, in order, except where it's part of something shown whole (a
  // figure's caption, a table cell) or not shown at all (the preamble).
  const opaque = nodes.filter((n) => n.kind === 'preamble' || n.kind === 'figure' || n.kind === 'table' || n.kind === 'verbatim')
  for (const r of math) {
    if (r.closed && r.from >= start && !opaque.some((o) => o.from <= r.from && r.from < o.to)) mathNode(r.from, r.to, r.tex, r.display)
  }

  // Refs can point forward, so they're resolved once every label is known.
  for (const n of nodes) {
    if (n.kind !== 'ref') continue
    n.text = refText(n.cmd, n.keys, labels)
  }

  // Heading sizes: the outermost level the document uses is h1.
  const topLevel = Math.min(...headings.map((h) => h.level))
  for (const h of headings) h.node.level = Math.min(3, h.level - topLevel + 1) as 1 | 2 | 3

  nodes.sort((a, b) => a.from - b.from)
  return { nodes, lists: listBodies, labels }

  function group(at: number): { body: string; end: number } | null {
    const ws = /^\s*/.exec(src.slice(at, at + 20))![0].length
    const open = at + ws
    if (src[open] !== '{') return null
    const close = closingBrace(src, open)
    if (close < 0) return null
    return { body: text.slice(open + 1, close), end: close + 1 }
  }

  function optional(at: number): { body: string; end: number } | null {
    const o = /^[ \t]*\[([^\]\n]*)\]/.exec(src.slice(at, at + 200))
    return o ? { body: o[1], end: at + o[0].length } : null
  }

  function heading(kind: string, starred: boolean, p: number, end: number): void {
    const level = SECTION_LEVEL[kind]
    let number: string | null = null
    if (kind === 'chapter') hasChapters = true
    if (!starred) {
      sec[level]++
      for (let k = level + 1; k < sec.length; k++) sec[k] = 0
      const from = hasChapters ? 0 : 1
      number = sec.slice(from, level + 1).join('.')
      current = { number, kind: 'section' }
    }
    let j = end
    const o = optional(j)
    if (o) j = o.end
    const open = src[j] === '{' ? j : -1
    const close = open >= 0 ? closingBrace(src, open) : -1
    const node = {
      kind: 'heading' as const,
      from: p,
      to: close >= 0 ? close + 1 : end,
      level: 1 as 1 | 2 | 3,
      openTo: close >= 0 ? open + 1 : -1,
      closeFrom: close,
      number,
    }
    nodes.push(node)
    headings.push({ node, level })
    if (open >= 0) re.lastIndex = open + 1 // the title is scanned as usual
  }

  function beginEnv(tok: EnvToken): void {
    const env = tok.name
    const marker = lists[env]
    if (marker) {
      const outer = stack[stack.length - 1]
      stack.push({
        env,
        marker,
        count: 0,
        depth: (outer?.depth ?? 0) + 1,
        enumDepth: stack.filter((l) => l.env === 'enumerate').length + (env === 'enumerate' ? 1 : 0),
        itemDepth: stack.filter((l) => l.marker === 'item' && l.env !== 'enumerate').length + (marker === 'item' && env !== 'enumerate' ? 1 : 0),
        bodyFrom: tok.to,
      })
      nodes.push({ kind: 'fence', from: tok.from, to: tok.to, env, begin: true })
      return
    }
    if (VERBATIM.test(env) || FIGURES.test(env) || TABLES.test(env) || TABULARS.test(env)) {
      const close = matchEnd(tokens, tok)
      if (!close) return
      re.lastIndex = close.to
      if (VERBATIM.test(env)) nodes.push({ kind: 'verbatim', from: tok.from, to: close.to })
      else if (FIGURES.test(env)) figureNode(tok, close)
      else tableNode(tok, close)
    }
  }

  function endEnv(tok: EnvToken): void {
    const i = stack.findLastIndex((l) => l.env === tok.name)
    if (i < 0) return
    const list = stack[i]
    listBodies.push({ from: list.bodyFrom, to: tok.from, depth: list.depth })
    stack.length = i
    nodes.push({ kind: 'fence', from: tok.from, to: tok.to, env: tok.name, begin: false })
  }

  function item(list: OpenList, name: string, p: number, end: number): void {
    const o = optional(end)
    list.count++
    const n = list.count
    let label: string
    let style: ItemStyle = 'number'
    let points: string | null = null
    let refNumber: string
    let kind: LabelKind = 'item'
    if (list.marker === 'question') {
      question++
      label = `${question}.`
      refNumber = String(question)
      kind = 'question'
      points = o?.body.trim() || null
    } else if (list.marker === 'part') {
      label = `(${alpha(n)})`
      refNumber = alpha(n)
      points = o?.body.trim() || null
    } else if (list.marker === 'subpart') {
      label = `${roman(n)}.`
      refNumber = roman(n)
      points = o?.body.trim() || null
    } else if (list.marker === 'subsubpart') {
      label = `${alpha(n).toUpperCase()}.`
      refNumber = alpha(n).toUpperCase()
      points = o?.body.trim() || null
    } else if (list.marker === 'choice') {
      if (/checkboxes$/.test(list.env)) {
        label = name === 'CorrectChoice' ? '☒' : '☐'
        style = 'box'
      } else label = `${alpha(n).toUpperCase()}.`
      refNumber = alpha(n).toUpperCase()
    } else if (o) {
      // \item[term]: a description term or a hand-written label.
      label = o.body.trim()
      style = 'term'
      refNumber = label
    } else if (list.env === 'enumerate') {
      const d = list.enumDepth
      label = d === 1 ? `${n}.` : d === 2 ? `(${alpha(n)})` : d === 3 ? `${roman(n)}.` : `${alpha(n).toUpperCase()}.`
      refNumber = d === 1 ? String(n) : d === 2 ? alpha(n) : d === 3 ? roman(n) : alpha(n).toUpperCase()
    } else {
      label = ['•', '–', '∗', '·'][Math.min(3, Math.max(0, list.itemDepth - 1))]
      style = 'bullet'
      refNumber = String(n)
    }
    const to = o ? o.end : end
    nodes.push({ kind: 'item', from: p, to, env: list.env, depth: list.depth, label, style, points, correct: name === 'CorrectChoice' })
    current = { number: refNumber, kind }
    re.lastIndex = to
  }

  function mathNode(from: number, to: number, tex: string, display: boolean): void {
    const env = /^\\begin\s*\{([^}]+)\}/.exec(tex)?.[1] ?? null
    const node: LiveNode = { kind: 'math', from, to, tex, display, env }
    nodes.push(node)
    if (!env || !NUMBERED_MATH.test(env)) return
    // Number each row as LaTeX would, and put the numbers in with \tag so
    // MathJax draws them where LaTeX does.
    const rows = env === 'equation' || env === 'multline' ? [wholeBody(tex)] : mathRows(tex)
    let tagged = ''
    let last = 0
    for (const r of rows) {
      const body = tex.slice(r.from, r.to)
      if (!body.trim() || /\\(nonumber|notag)(?![A-Za-z])/.test(body)) continue
      const explicit = /\\tag\*?\s*\{([^}]*)\}/.exec(body)
      const number = explicit ? explicit[1] : String(++equation)
      for (const l of body.matchAll(/\\label\s*\{([^}]*)\}/g)) labels.set(l[1].trim(), { number, kind: 'equation', pos: from + r.from + l.index! })
      if (!explicit) {
        tagged += tex.slice(last, r.to) + `\\tag{${number}}`
        last = r.to
      }
    }
    node.tex = tagged + tex.slice(last)
  }

  function figureNode(begin: EnvToken, close: EnvToken): void {
    const body = src.slice(begin.to, close.from)
    const images = [...body.matchAll(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].map((g) => g[1].trim())
    const caption = captionOf(begin.to, close.from)
    let number: string | null = null
    if (caption !== null) {
      number = String(++figure)
      current = { number, kind: 'figure' }
    }
    const keys = labelsIn(begin.to, close.from)
    nodes.push({ kind: 'figure', from: begin.from, to: close.to, images, caption, number, labels: keys })
  }

  function tableNode(begin: EnvToken, close: EnvToken): void {
    let tab: Tabular | null = null
    // The tabular itself, or the first one inside a table.
    const inner = TABULARS.test(begin.name) ? begin : tokens.find((t) => t.kind === 'begin' && TABULARS.test(t.name) && t.from > begin.from && t.from < close.from)
    const innerEnd = inner && (inner === begin ? close : matchEnd(tokens, inner))
    if (inner && innerEnd) {
      let j = inner.to
      if (inner.name === 'tabularx' || inner.name === 'tabular*') j = group(j)?.end ?? j // the width
      const o = optional(j) // [t] position
      if (o) j = o.end
      const spec = group(j)
      if (spec) tab = parseTabular(spec.body, text.slice(spec.end, innerEnd.from))
    }
    let caption: string | null = null
    let number: string | null = null
    if (!TABULARS.test(begin.name)) {
      caption = captionOf(begin.to, close.from)
      if (caption !== null) {
        number = String(++table)
        current = { number, kind: 'table' }
      }
    }
    nodes.push({ kind: 'table', from: begin.from, to: close.to, tabular: tab, caption, number, labels: labelsIn(begin.to, close.from) })
  }

  function captionOf(from: number, to: number): string | null {
    const c = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(src.slice(from, to))
    if (!c) return null
    const open = from + c.index + c[0].length - 1
    const close = closingBrace(src, open)
    return close < 0 || close > to ? null : text.slice(open + 1, close).trim()
  }

  function labelsIn(from: number, to: number): string[] {
    const keys = [...src.slice(from, to).matchAll(/\\label\s*\{([^}]*)\}/g)].map((l) => l[1].trim())
    for (const k of keys) if (current) labels.set(k, { ...current, pos: from })
    return keys
  }
}

/** The display text of a \ref-like command, or null when a key isn't defined. */
function refText(cmd: string, keys: string[], labels: Map<string, LabelTarget>): string | null {
  if (isCite(cmd)) return keys.join(', ')
  const parts: string[] = []
  for (const k of keys) {
    const t = labels.get(k)
    if (!t) return null
    if (cmd === 'pageref') parts.push(`p. ${k}`)
    else if (cmd === 'eqref') parts.push(`(${t.number})`)
    else if (cmd === 'cref' || cmd === 'Cref' || cmd === 'autoref') {
      const name = { section: 'section', equation: 'eq.', figure: 'fig.', table: 'table', question: 'question', item: 'item' }[t.kind]
      const n = t.kind === 'equation' ? `(${t.number})` : t.number
      parts.push(`${cmd === 'Cref' || cmd === 'autoref' ? name[0].toUpperCase() + name.slice(1) : name} ${n}`)
    } else parts.push(t.number)
  }
  return parts.join(', ')
}

/** The body of a \begin{env}...\end{env} (offsets into `tex`). */
function wholeBody(tex: string): { from: number; to: number } {
  const open = /^\\begin\s*\{[^}]*\}(\s*\{[^}]*\})?/.exec(tex)
  const close = /\\end\s*\{[^}]*\}\s*$/.exec(tex)
  return { from: open ? open[0].length : 0, to: close ? close.index : tex.length }
}

/** The rows of an align-like environment: its body split at top-level \\. */
function mathRows(tex: string): { from: number; to: number }[] {
  const body = wholeBody(tex)
  return splitTop(tex, body.from, body.to, '\\\\')
}

/**
 * Splits text[from, to) at `sep` where it isn't inside braces or a nested
 * environment. Returns the pieces' ranges (separators excluded).
 */
function splitTop(text: string, from: number, to: number, sep: '\\\\' | '&'): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  let depth = 0
  let envDepth = 0
  let startAt = from
  for (let i = from; i < to; i++) {
    const c = text[i]
    if (c === '\\') {
      if (text.startsWith('\\begin', i)) envDepth++
      else if (text.startsWith('\\end', i)) envDepth--
      else if (sep === '\\\\' && text[i + 1] === '\\' && depth === 0 && envDepth === 0) {
        out.push({ from: startAt, to: i })
        i++
        // \\[2pt] spacing belongs to the separator.
        const o = /^\[[^\]]*\]/.exec(text.slice(i + 1, i + 40))
        if (o) i += o[0].length
        startAt = i + 1
        continue
      }
      i++ // an escaped character (\&, \{) or a command's first letter
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '%') {
      const nl = text.indexOf('\n', i)
      i = nl < 0 || nl > to ? to : nl
    } else if (sep === '&' && c === '&' && depth === 0 && envDepth === 0) {
      out.push({ from: startAt, to: i })
      startAt = i + 1
    }
  }
  out.push({ from: startAt, to })
  return out
}

const RULE = /^\s*(\\(hline|toprule|midrule|bottomrule|cline\s*\{[^}]*\}|cmidrule\s*(\([^)]*\))?\s*\{[^}]*\})\s*)+/

/** A tabular's column spec and body as rows of cells, or null when it's beyond this parser. */
export function parseTabular(spec: string, body: string): Tabular | null {
  const cols: Tabular['cols'] = []
  const vlines: boolean[] = [false]
  const s = expandSpec(spec)
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '|') vlines[cols.length] = true
    else if (c === 'l' || c === 'c' || c === 'r') {
      cols.push(c)
      vlines[cols.length] = false
    } else if (c === 'p' || c === 'm' || c === 'b' || c === 'X') {
      cols.push('l')
      vlines[cols.length] = false
      if (s[i + 1] === '{') i = skipGroup(s, i + 1)
    } else if (c === '@' || c === '>' || c === '<' || c === '!') {
      if (s[i + 1] === '{') i = skipGroup(s, i + 1)
    } else if (!/\s/.test(c)) return null
  }
  if (!cols.length) return null

  const rows: TableRow[] = []
  let pendingRule = false
  const pieces = splitTop(body, 0, body.length, '\\\\')
  for (const [k, piece] of pieces.entries()) {
    let rowText = body.slice(piece.from, piece.to)
    const rule = RULE.exec(rowText)
    if (rule) {
      pendingRule = true
      rowText = rowText.slice(rule[0].length)
    }
    if (!rowText.trim()) {
      if (k === pieces.length - 1) break
      continue
    }
    const cells: TableCell[] = []
    let col = 0
    for (const c of splitTop(rowText, 0, rowText.length, '&')) {
      const cellTex = rowText.slice(c.from, c.to).trim()
      const mc = /^\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}$/.exec(cellTex)
      if (mc) {
        const a = /[lcr]/.exec(mc[2])?.[0] as 'l' | 'c' | 'r' | undefined
        cells.push({ tex: mc[3], span: Number(mc[1]), align: a ?? 'c' })
        col += Number(mc[1])
      } else {
        cells.push({ tex: cellTex, span: 1, align: cols[Math.min(col, cols.length - 1)] })
        col++
      }
    }
    rows.push({ cells, ruleAbove: pendingRule })
    pendingRule = false
  }
  return { cols, vlines, rows, ruleBelow: pendingRule }
}

/** Expands *{n}{spec} in a column spec. */
function expandSpec(spec: string): string {
  let s = spec
  for (let guard = 0; guard < 10; guard++) {
    const m = /\*\s*\{(\d+)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/.exec(s)
    if (!m) break
    s = s.slice(0, m.index) + m[2].repeat(Math.min(50, Number(m[1]))) + s.slice(m.index + m[0].length)
  }
  return s
}

function skipGroup(s: string, open: number): number {
  const close = closingBrace(s, open)
  return close < 0 ? s.length : close
}

/**
 * Readable text for a caption or table cell: formatting kept as a few
 * tags, other commands dropped, math left as $...$ for the caller to render.
 */
export function inlineParts(tex: string): { text: string; math: boolean; style?: string }[] {
  const out: { text: string; math: boolean; style?: string }[] = []
  let last = 0
  const push = (t: string, style?: string) => {
    const clean = t
      .replace(/\\label\s*\{[^}]*\}/g, '')
      .replace(/\\(?:ref|eqref|cref|Cref|autoref)\s*\{([^}]*)\}/g, '$1')
      .replace(/\\(textbf|textit|emph|underline|texttt|textsc)\s*\{([^{}]*)\}/g, '$2')
      .replace(/---/g, '—')
      .replace(/--/g, '–')
      .replace(/``/g, '“')
      .replace(/''/g, '”')
      .replace(/\\([%&$#_{}])/g, '$1')
      .replace(/\\\\/g, ' ')
      .replace(/~/g, ' ')
      .replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?/g, '')
      .replace(/[{}]/g, '')
    if (clean) out.push({ text: clean, math: false, style })
  }
  for (const r of findMathRegions(tex)) {
    pushText(tex.slice(last, r.from))
    out.push({ text: r.tex, math: true })
    last = r.to
  }
  pushText(tex.slice(last))
  return out

  // Top-level \textbf{...} / \emph{...} keep their style; everything else is plain.
  function pushText(t: string): void {
    let i = 0
    for (const f of t.matchAll(/\\(textbf|textit|emph)\s*\{/g)) {
      if (f.index! < i) continue
      const open = f.index! + f[0].length - 1
      const close = closingBrace(t, open)
      if (close < 0) break
      push(t.slice(i, f.index!))
      push(t.slice(open + 1, close), f[1] === 'textbf' ? 'bold' : 'italic')
      i = close + 1
    }
    push(t.slice(i))
  }
}
