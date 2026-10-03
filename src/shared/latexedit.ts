// The text logic behind the editor's LaTeX editing helpers, kept free of
// CodeMirror so it can be unit tested: environment matching, list
// continuation, \begin auto-close, formatting toggles, the outline, labels,
// user snippets and command signatures.
//
// Offsets are into the document text as CodeMirror sees it (one character per
// line break), so callers pass state.doc.toString().

/** Replaces % comments with spaces, keeping every offset where it was. */
export function blankComments(text: string): string {
  return text.replace(/(?<!\\)%.*$/gm, (m) => ' '.repeat(m.length))
}

export interface EnvToken {
  kind: 'begin' | 'end'
  name: string
  /** The whole \begin{name}. */
  from: number
  to: number
  /** Just the name inside the braces. */
  nameFrom: number
  nameTo: number
}

/** Every \begin{...} and \end{...} outside comments, in order. Empty names count, so renaming can pass through one. */
export function envTokens(text: string): EnvToken[] {
  const out: EnvToken[] = []
  for (const m of blankComments(text).matchAll(/\\(begin|end)\s*\{([^}\s\\]*)\}/g)) {
    const nameFrom = m.index! + m[0].indexOf('{') + 1
    out.push({ kind: m[1] as 'begin' | 'end', name: m[2], from: m.index!, to: m.index! + m[0].length, nameFrom, nameTo: nameFrom + m[2].length })
  }
  return out
}

/** The environments open at `pos`, outermost first. */
export function envStackAt(tokens: EnvToken[], pos: number): EnvToken[] {
  const stack: EnvToken[] = []
  for (const t of tokens) {
    if (t.to > pos) break
    if (t.kind === 'begin') stack.push(t)
    else {
      // Close the nearest open environment of that name (a stray \end is ignored).
      const i = stack.findLastIndex((b) => b.name === t.name)
      if (i >= 0) stack.length = i
    }
  }
  return stack
}

/** The \end that closes `begin`, or null when it is still open. */
export function matchEnd(tokens: EnvToken[], begin: EnvToken): EnvToken | null {
  let depth = 0
  for (const t of tokens) {
    if (t.from < begin.from || t.name !== begin.name) continue
    depth += t.kind === 'begin' ? 1 : -1
    if (depth === 0) return t
  }
  return null
}

/** The \begin that `end` closes, or null. */
export function matchBegin(tokens: EnvToken[], end: EnvToken): EnvToken | null {
  let depth = 0
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (t.from > end.from || t.name !== end.name) continue
    depth += t.kind === 'end' ? 1 : -1
    if (depth === 0) return t
  }
  return null
}

/** A change to the document plus where the cursor goes, in the changed document's offsets. */
export interface Edit {
  changes: { from: number; to: number; insert: string }[]
  anchor: number
  head?: number
}

const lineAt = (text: string, pos: number) => {
  const from = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  const to = nl < 0 ? text.length : nl
  return { from, to, text: text.slice(from, to) }
}
const indentOf = (line: string) => /^[ \t]*/.exec(line)![0]
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * List environments and their item command (without the backslash), e.g.
 * { itemize: 'item', questions: 'question' }. The defaults; a vault adds its
 * own in .vault.json.
 */
export const DEFAULT_LISTS: Record<string, string> = { itemize: 'item', enumerate: 'item', description: 'item' }

/**
 * Enter inside a list. On a line with content, starts the next item at the
 * list's item indentation. On an empty item: when it is the list's last,
 * leaves the list (into the parent list's next item, if the list is nested);
 * otherwise just clears the marker. Null when Enter should behave normally.
 */
export function listEnter(text: string, pos: number, lists: Record<string, string>, indentUnit = '    '): Edit | null {
  const tokens = envTokens(text)
  const stack = envStackAt(tokens, pos)
  const env = stack.at(-1)
  if (!env || !(env.name in lists)) return null
  const line = lineAt(text, pos)
  if (env.from >= line.from) return null // on the \begin line itself
  if (!line.text.trim()) return null

  const marker = lists[env.name]
  const bare = new RegExp(`^[ \\t]*\\\\${escapeRe(marker)}[ \\t]*$`)
  if (bare.test(line.text) && pos >= line.from + line.text.trimEnd().length) {
    const end = matchEnd(tokens, env)
    const next = nextNonBlankLine(text, line.to)
    if (end && next && end.from >= next.from && end.from <= next.from + next.text.length - next.text.trimStart().length) {
      // Last item: remove it and continue after \end{...}.
      const endLine = lineAt(text, end.from)
      const parent = stack.at(-2)
      const parentMarker = parent && parent.name in lists ? lists[parent.name] : null
      const tail = indentOf(endLine.text) + (parentMarker ? `\\${parentMarker} ` : '')
      const removeTo = Math.min(line.to + 1, text.length)
      const removed = removeTo - line.from
      return {
        changes: [
          { from: line.from, to: removeTo, insert: '' },
          { from: endLine.to, to: endLine.to, insert: '\n' + tail },
        ],
        anchor: endLine.to - removed + 1 + tail.length,
      }
    }
    // An empty item in the middle: drop the marker, keep the line.
    const indent = indentOf(line.text)
    return { changes: [{ from: line.from, to: line.to, insert: indent }], anchor: line.from + indent.length }
  }

  // The indentation of this list's own items (not those of a nested list).
  let indent: string | null = null
  const markerRe = new RegExp(`^([ \\t]*)\\\\${escapeRe(marker)}(?![A-Za-z@])`, 'gm')
  for (const m of text.slice(0, line.to).matchAll(markerRe)) {
    if (m.index! < env.to) continue
    if (envStackAt(tokens, m.index!).at(-1)?.from === env.from) indent = m[1]
  }
  indent ??= indentOf(lineAt(text, env.from).text) + indentUnit
  const insert = `\n${indent}\\${marker} `
  return { changes: [{ from: pos, to: pos, insert }], anchor: pos + insert.length }
}

function nextNonBlankLine(text: string, after: number): { from: number; text: string } | null {
  let from = after + 1
  while (from <= text.length) {
    const l = lineAt(text, from)
    if (l.text.trim()) return l
    if (l.to >= text.length) return null
    from = l.to + 1
  }
  return null
}

/**
 * Enter at the end of a \begin{name}... line whose environment isn't closed
 * yet: adds the \end{name} under it, and the first item for a list.
 */
export function beginEnter(text: string, pos: number, lists: Record<string, string>, indentUnit = '    '): Edit | null {
  const line = lineAt(text, pos)
  if (text.slice(pos, line.to).trim()) return null
  const before = blankComments(line.text).slice(0, pos - line.from)
  const m = /\\begin\s*\{([^}\s\\]+)\}(?:\s*(?:\[[^\]]*\]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}))*\s*$/.exec(before)
  if (!m) return null
  const name = m[1]
  if (!isUnclosed(text, name)) return null
  const indent = indentOf(line.text)
  const marker = lists[name] ? `\\${lists[name]} ` : ''
  const first = `\n${indent}${indentUnit}${marker}`
  return {
    changes: [{ from: pos, to: line.to, insert: `${first}\n${indent}\\end{${name}}` }],
    anchor: pos + first.length,
  }
}

/** More \begin{name} than \end{name} in the document. */
export function isUnclosed(text: string, name: string): boolean {
  let balance = 0
  for (const t of envTokens(text)) if (t.name === name) balance += t.kind === 'begin' ? 1 : -1
  return balance > 0
}

/**
 * Editing the name in \begin{...} or \end{...}: the same edit for the
 * partner, so the pair stays matched. `from`/`to`/`insert` is the edit, in
 * `text` (before it). Returns the partner's change, also in `text`, or null.
 */
export function mirrorEnvRename(text: string, from: number, to: number, insert: string): { from: number; to: number; insert: string } | null {
  if (/[{}\s\\%]/.test(insert)) return null
  const tokens = envTokens(text)
  const tok = tokens.find((t) => from >= t.nameFrom && to <= t.nameTo)
  if (!tok) return null
  const partner = tok.kind === 'begin' ? matchEnd(tokens, tok) : matchBegin(tokens, tok)
  if (!partner) return null
  const name = tok.name.slice(0, from - tok.nameFrom) + insert + tok.name.slice(to - tok.nameFrom)
  return { from: partner.nameFrom, to: partner.nameTo, insert: name }
}

/**
 * Ctrl+B and friends. With a selection: wraps it in \cmd{...}, or unwraps it
 * if it already is (the selection being the inside or the whole thing).
 * Without one: unwraps the \cmd{...} the cursor is in, or inserts \cmd{}
 * with the cursor inside. `alternates` are other commands the key also
 * removes instead of nesting (Ctrl+B in math removes \mathbf as well as
 * \boldsymbol).
 */
export function toggleCommand(text: string, from: number, to: number, cmd: string, alternates: string[] = []): Edit {
  const names = [cmd, ...alternates]
  const open = `\\${cmd}{`
  if (from !== to) {
    const sel = text.slice(from, to)
    for (const name of names) {
      const o = `\\${name}{`
      if (text.slice(from - o.length, from) === o && text[to] === '}' && balanced(sel)) {
        return {
          changes: [
            { from: from - o.length, to: from, insert: '' },
            { from: to, to: to + 1, insert: '' },
          ],
          anchor: from - o.length,
          head: to - o.length,
        }
      }
      if (sel.startsWith(o) && sel.endsWith('}') && closingBrace(text, from + o.length - 1) === to - 1) {
        return {
          changes: [{ from, to, insert: sel.slice(o.length, -1) }],
          anchor: from,
          head: to - o.length - 1,
        }
      }
    }
    return { changes: [{ from, to, insert: `${open}${sel}}` }], anchor: from + open.length, head: to + open.length }
  }
  // Walk out through the groups around the cursor, looking for \cmd{ (or an alternate).
  let i = from
  for (let steps = 0; steps < 20; steps++) {
    const brace = openingBrace(text, i)
    if (brace < 0) break
    const close = closingBrace(text, brace)
    if (close < 0) break
    const name = names.find((n) => text.slice(brace - n.length - 1, brace + 1) === `\\${n}{`)
    if (name) {
      const start = brace - name.length - 1
      return {
        changes: [
          { from: start, to: brace + 1, insert: '' },
          { from: close, to: close + 1, insert: '' },
        ],
        anchor: from - name.length - 2,
      }
    }
    i = brace
  }
  return { changes: [{ from, to, insert: `${open}}` }], anchor: from + open.length }
}

/** Ctrl+M: $...$ around the selection, or removes it. Empty selection: $|$, or unwraps the math the cursor is in. */
export function toggleInlineMath(text: string, from: number, to: number, mathAt: { from: number; to: number } | null): Edit {
  if (from !== to) {
    const sel = text.slice(from, to)
    if (text[from - 1] === '$' && text[to] === '$' && text[from - 2] !== '$') {
      return { changes: [{ from: from - 1, to: from, insert: '' }, { from: to, to: to + 1, insert: '' }], anchor: from - 1, head: to - 1 }
    }
    if (/^\$[^$]+\$$/.test(sel)) return { changes: [{ from, to, insert: sel.slice(1, -1) }], anchor: from, head: to - 2 }
    return { changes: [{ from, to, insert: `$${sel}$` }], anchor: from + 1, head: to + 1 }
  }
  if (mathAt && text[mathAt.from] === '$' && text[mathAt.from + 1] !== '$' && text[mathAt.to - 1] === '$') {
    return {
      changes: [{ from: mathAt.from, to: mathAt.from + 1, insert: '' }, { from: mathAt.to - 1, to: mathAt.to, insert: '' }],
      anchor: from - 1,
    }
  }
  return { changes: [{ from, to, insert: '$$' }], anchor: from + 1 }
}

/**
 * Ctrl+Shift+M, Ctrl+Shift+A and friends: the selection (or nothing) inside
 * `open` … `close` (e.g. \[ … \] or \begin{align} … \end{align}), each on its
 * own line, the body indented one level. A multi-line selection keeps its
 * relative indentation. The body ends up selected, or the cursor in it.
 */
export function wrapBlock(text: string, from: number, to: number, open: string, close: string, indentUnit = '    '): Edit {
  const line = lineAt(text, from)
  const indent = indentOf(line.text)
  // A selection starting after the line's indentation counts it, so the
  // first line's indentation compares fairly with the rest.
  const start = text.slice(line.from, from).trim() ? from : line.from
  const lines = text.slice(start, to).replace(/^\s*\n|\s+$/g, '').split('\n')
  const common = Math.min(...lines.filter((l) => l.trim()).map((l) => indentOf(l).length), Infinity)
  const body = lines.map((l) => (l.trim() ? indent + indentUnit + l.slice(Number.isFinite(common) ? common : 0) : '')).join('\n')
  // Text before or after on the same line stays there, minus the spaces
  // that separated it from the selection.
  const before = text.slice(line.from, from)
  const after = text.slice(to, lineAt(text, to).to)
  const pre = before.trim() ? `\n${indent}` : ''
  const post = after.trim() ? `\n${indent}` : ''
  if (pre) from -= before.length - before.trimEnd().length
  if (post) to += after.length - after.trimStart().length
  const head = `${pre}${open}\n`
  const bodyStart = head.length + (body ? indentOf(body).length : indent.length + indentUnit.length)
  const insert = `${head}${body || indent + indentUnit}\n${indent}${close}${post}`
  return { changes: [{ from, to, insert }], anchor: from + bodyStart, head: from + head.length + (body.length || indent.length + indentUnit.length) }
}

function balanced(s: string): boolean {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++
    else if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth < 0) return false
  }
  return depth === 0
}

const escaped = (text: string, i: number) => {
  let n = 0
  while (text[i - 1 - n] === '\\') n++
  return n % 2 === 1
}

/** The unmatched { before `pos`, stopping at a blank line; -1 if none. */
function openingBrace(text: string, pos: number): number {
  let depth = 0
  for (let i = pos - 1; i >= 0; i--) {
    const c = text[i]
    if (c === '\n' && /\n[ \t]*$/.test(text.slice(Math.max(0, i - 200), i))) return -1
    if ((c !== '{' && c !== '}') || escaped(text, i)) continue
    if (c === '}') depth++
    else if (depth === 0) return i
    else depth--
  }
  return -1
}

/** The } matching the { at `open`; -1 if unclosed. */
export function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if ((c !== '{' && c !== '}') || escaped(text, i)) continue
    if (c === '{') depth++
    else if (--depth === 0) return i
  }
  return -1
}

export interface OutlineItem {
  kind: 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'question'
  /** Nesting depth for display, 0 = outermost. */
  depth: number
  title: string
  /** 1-based. */
  line: number
}

const SECTION_LEVEL: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 }

/**
 * Sections and exam-class questions, in order. Questions are numbered
 * through the file (handout.cls keeps numbering going across `questions`
 * environments) and sit one level under the section they're in. \part is
 * left out: in exam documents it is a question part, not a heading.
 */
export function outline(text: string): OutlineItem[] {
  const src = blankComments(text)
  const items: OutlineItem[] = []
  let sectionLevel = -1
  let top = Infinity
  let q = 0
  const lineOf = (i: number) => {
    let n = 1
    for (let k = src.indexOf('\n'); k >= 0 && k < i; k = src.indexOf('\n', k + 1)) n++
    return n
  }
  for (const m of src.matchAll(/\\(chapter|section|subsection|subsubsection|question|resetquestions)(\*?)(?![A-Za-z@])/g)) {
    // handout.cls's \resetquestions starts the numbering over.
    if (m[1] === 'resetquestions') {
      q = 0
      continue
    }
    const kind = m[1] as OutlineItem['kind']
    let i = m.index! + m[0].length
    const opt = /^\s*\[[^\]]*\]/.exec(src.slice(i))
    if (opt) i += opt[0].length
    if (kind === 'question') {
      q++
      const rest = src.slice(i, src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i))
      // A question that opens with a bold title ("\textbf{Tangents}: On the
      // last homework…") is listed by that title.
      const bold = /^\s*\\textbf\s*\{/.exec(rest)
      const title = plain(bold ? readGroup(rest, bold[0].length - 1) : rest)
      items.push({ kind, depth: sectionLevel + 1, title: title ? `${q}. ${title}` : `Question ${q}`, line: lineOf(m.index!) })
    } else {
      const arg = /^\s*\{/.test(src.slice(i)) ? readGroup(src, src.indexOf('{', i)) : ''
      sectionLevel = SECTION_LEVEL[kind]
      top = Math.min(top, sectionLevel)
      items.push({ kind, depth: sectionLevel, title: plain(arg) || '(untitled)', line: lineOf(m.index!) })
    }
  }
  // Shift so the outermost heading used is depth 0.
  const shift = Number.isFinite(top) ? top : 0
  for (const it of items) it.depth = Math.max(0, it.depth - shift)
  return items
}

function readGroup(text: string, open: number): string {
  const close = closingBrace(text, open)
  return close < 0 ? text.slice(open + 1) : text.slice(open + 1, close)
}

/** Readable text from a line of LaTeX, for outline titles. */
export function plain(tex: string): string {
  const s = tex
    .replace(/\\(?:label|ref|vspace|hspace|answerspace|points)\*?\{[^}]*\}/g, '')
    .replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*:$/, '')
    .trim()
  return s.length > 60 ? s.slice(0, 58).trimEnd() + '…' : s
}

/** \label names in the text, in order, without duplicates. */
export function labels(text: string): string[] {
  return [...new Set([...blankComments(text).matchAll(/\\label\s*\{([^}]+)\}/g)].map((m) => m[1].trim()))]
}

export interface Snippet {
  name: string
  description: string
  /** CodeMirror snippet template: ${1:text} fields, \t for one indent level. */
  body: string
}

/**
 * The vault's snippet file. Each snippet starts with a header line
 *   %%% name — description
 * and its body is everything up to the next header, less trailing blank
 * lines. Anything before the first header is ignored (for instructions).
 */
export function parseSnippets(text: string): Snippet[] {
  const out: Snippet[] = []
  let cur: { name: string; description: string; lines: string[] } | null = null
  const flush = () => {
    if (!cur) return
    while (cur.lines.length && !cur.lines.at(-1)!.trim()) cur.lines.pop()
    // Leading indentation of four spaces (or a tab) becomes one indent level.
    const body = cur.lines.map((l) => l.replace(/^((?: {4}|\t)+)/, (ws) => '\t'.repeat(ws.replace(/ {4}/g, '\t').length))).join('\n')
    if (body.trim()) out.push({ name: cur.name, description: cur.description, body })
  }
  for (const raw of text.split(/\r?\n/)) {
    const h = /^%%%\s*([A-Za-z@][\w@*-]*)\s*(?:[—–:-]+\s*(.*))?$/.exec(raw)
    if (h) {
      flush()
      cur = { name: h[1], description: (h[2] ?? '').trim(), lines: [] }
    } else if (cur) cur.lines.push(raw)
  }
  flush()
  return out
}

/** Global snippets then the vault's own; the vault wins on a name clash. */
export function mergeTextSnippets(global: Snippet[], own: Snippet[]): Snippet[] {
  const names = new Set(own.map((s) => s.name))
  return [...global.filter((s) => !names.has(s.name)), ...own]
}

export interface CommandSig {
  name: string
  /** Required arguments. */
  args: number
  /** Takes an optional [argument] first. */
  optional: boolean
}

/** Commands defined in `text` (a class, package or preamble) and how many arguments they take. Internal @ names are skipped. */
export function commandSignatures(text: string): CommandSig[] {
  const src = blankComments(text)
  const out = new Map<string, CommandSig>()
  const add = (name: string, args: number, optional: boolean) => {
    if (!name.includes('@')) out.set(name, { name, args, optional })
  }
  const re = /\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*(?:\[\s*(\d)\s*\])?\s*(\[)?/g
  for (const m of src.matchAll(re)) {
    const n = Number(m[3] ?? 0)
    add(m[1] ?? m[2], m[4] ? Math.max(0, n - 1) : n, !!m[4])
  }
  const xparse = /\\(?:New|Renew|Provide|Declare)DocumentCommand\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*\{([^}]*)\}/g
  for (const m of src.matchAll(xparse)) {
    const spec = m[3].replace(/\{[^}]*\}/g, '')
    add(m[1] ?? m[2], (spec.match(/[mvb]/g) ?? []).length, /^\s*[oO]/.test(spec))
  }
  for (const m of src.matchAll(/\\DeclareMathOperator\*?\s*\{?\s*\\([A-Za-z]+)/g)) add(m[1], 0, false)
  return [...out.values()]
}
