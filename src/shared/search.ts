// Vault-wide search, replace and label rename. Pure text logic: the main
// process runs it over the vault's files, the renderer over open buffers.
//
// Offsets are into the text with \r\n turned into \n, which is also how
// CodeMirror counts positions, so matches can be applied to an editor
// directly whatever the file's line endings.

export interface SearchOptions {
  regex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  /** Also match inside % comments. */
  includeComments: boolean
}

export interface SearchMatch {
  from: number
  to: number
  /** 1-based. */
  line: number
  /** The line's text around the match, for showing in a result list. */
  before: string
  text: string
  after: string
  /** Capture groups, for $1… in a regex replacement. */
  groups?: string[]
}

export interface FileMatches {
  rel: string
  matches: SearchMatch[]
}

export interface SearchResult {
  files: FileMatches[]
  /** More matches than the limit: only the first ones are listed. */
  truncated: boolean
  /** The query isn't a valid regular expression (the message says why). */
  error?: string
}

/** Files worth searching: sources and the text files that go with them. */
export const SEARCHABLE = /\.(tex|cls|sty|bib|txt|cfg|md|bbx|cbx|dtx|ins)$/i

export const normalizeEol = (text: string) => text.replace(/\r\n?/g, '\n')

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const WORD = /[A-Za-z0-9_]/

/** The query as a global RegExp, or an error message. */
export function compileQuery(query: string, opts: SearchOptions): RegExp | string {
  if (!query) return 'Empty query'
  let src = opts.regex ? query : escapeRegex(query)
  // Word boundaries only where the query itself starts or ends with a word
  // character, so "\vec" whole-word skips \vector but still matches "a\vec".
  if (opts.wholeWord) {
    if (WORD.test(query[0])) src = `(?<![A-Za-z0-9_])(?:${src})`
    if (WORD.test(query[query.length - 1])) src = `(?:${src})(?![A-Za-z0-9_])`
  }
  try {
    return new RegExp(src, opts.caseSensitive ? 'gm' : 'gim')
  } catch (e) {
    return (e as Error).message.replace(/^Invalid regular expression: /, '')
  }
}

/** Where each line's comment starts (an unescaped %), or -1. Indexed by 0-based line. */
function commentStarts(lines: string[]): number[] {
  return lines.map((line) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') i++ // skip the escaped character, e.g. \%
      else if (line[i] === '%') return i
    }
    return -1
  })
}

const PREVIEW_BEFORE = 40
const PREVIEW_AFTER = 80

/** Every match of `query` in `text` (normalized to \n), at most `limit`. */
export function searchText(text: string, query: string | RegExp, opts: SearchOptions, limit = Infinity): SearchMatch[] {
  const re = typeof query === 'string' ? compileQuery(query, opts) : query
  if (typeof re === 'string') return []
  const src = normalizeEol(text)
  const lines = src.split('\n')
  const starts: number[] = []
  let at = 0
  for (const l of lines) {
    starts.push(at)
    at += l.length + 1
  }
  const comments = opts.includeComments ? null : commentStarts(lines)

  const out: SearchMatch[] = []
  re.lastIndex = 0
  let lineNo = 0
  for (let m = re.exec(src); m && out.length < limit; m = re.exec(src)) {
    if (m[0].length === 0) {
      re.lastIndex++ // an empty match (e.g. /x*/) would loop forever
      continue
    }
    const from = m.index
    while (lineNo + 1 < starts.length && starts[lineNo + 1] <= from) lineNo++
    const col = from - starts[lineNo]
    if (comments && comments[lineNo] >= 0 && col >= comments[lineNo]) continue
    const line = lines[lineNo]
    const end = Math.min(line.length, col + m[0].length)
    out.push({
      from,
      to: from + m[0].length,
      line: lineNo + 1,
      before: (col > PREVIEW_BEFORE ? '…' : '') + line.slice(Math.max(0, col - PREVIEW_BEFORE), col).trimStart(),
      text: line.slice(col, end) + (end - col < m[0].length ? '⏎' : ''),
      after: line.slice(end, end + PREVIEW_AFTER),
      groups: opts.regex ? m.slice(1).map((g) => g ?? '') : undefined,
    })
  }
  return out
}

/**
 * The text that replaces one match: `$1`…`$9` and `$&` refer to the match
 * in a regex search, `$$` is a dollar sign; a plain search inserts
 * `replacement` as it is.
 */
export function expandReplacement(replacement: string, match: SearchMatch): string {
  if (!match.groups) return replacement
  return replacement.replace(/\$(\$|&|\d)/g, (all, k: string) => {
    if (k === '$') return '$'
    if (k === '&') return match.text
    const g = match.groups![Number(k) - 1]
    return g ?? all
  })
}

/** Edits replacing each of `matches` (from the same text) with `replacement`. */
export function replacementChanges(matches: SearchMatch[], replacement: string): { from: number; to: number; insert: string }[] {
  return matches.map((m) => ({ from: m.from, to: m.to, insert: expandReplacement(replacement, m) }))
}

/** Applies changes (non-overlapping, any order) to normalized text. */
export function applyChanges(text: string, changes: { from: number; to: number; insert: string }[]): string {
  let out = normalizeEol(text)
  for (const c of [...changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  return out
}

// ---------------------------------------------------------------------------
// Label keys: \label{key} and every command that refers to one.

const REF_COMMANDS = [
  'label', 'ref', 'eqref', 'pageref', 'autoref', 'Autoref', 'nameref', 'vref', 'Vref', 'vpageref',
  'cref', 'Cref', 'cpageref', 'Cpageref', 'labelcref', 'crefrange', 'Crefrange', 'cpagerefrange', 'Cpagerefrange',
  'subref', 'zref', 'zlabel',
]
// \cmd*[opt]{keys} (crefrange has two key arguments), and \hyperref[key]{text}.
const KEYED = new RegExp(String.raw`\\(${REF_COMMANDS.join('|')})\*?\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}(?:\s*\{([^{}]*)\})?|\\hyperref\s*\[([^\]]*)\]`, 'g')

/** Each label key in `text` with its position (keys in comma lists count separately). */
function keySpans(text: string): { key: string; from: number; to: number }[] {
  const out: { key: string; from: number; to: number }[] = []
  const add = (list: string, start: number) => {
    let at = start
    for (const part of list.split(',')) {
      const lead = part.length - part.trimStart().length
      const key = part.trim()
      if (key) out.push({ key, from: at + lead, to: at + lead + key.length })
      at += part.length + 1
    }
  }
  KEYED.lastIndex = 0
  for (const m of text.matchAll(KEYED)) {
    const base = m.index!
    if (m[4] !== undefined) {
      add(m[4], base + m[0].indexOf('[') + 1)
      continue
    }
    const first = base + m[0].indexOf('{') + 1
    add(m[2], first)
    // Only the range commands take a second key argument; for the others
    // the next group is unrelated text, e.g. \ref{a}{b} is never written.
    if (m[3] !== undefined && /range$/.test(m[1])) add(m[3], base + m[0].lastIndexOf('{') + 1)
  }
  return out
}

/** The label key at `pos` (inside \label{…}, \ref{…}, \cref{a,b}, …), or null. */
export function keyAt(text: string, pos: number): string | null {
  const src = normalizeEol(text)
  // Only the lines around pos can hold it.
  const start = pos > 200 ? src.lastIndexOf('\n', pos - 200) + 1 : 0
  const endNl = src.indexOf('\n', pos + 200)
  const slice = src.slice(start, endNl < 0 ? src.length : endNl)
  for (const s of keySpans(slice)) if (start + s.from <= pos && pos <= start + s.to) return s.key
  return null
}

/** Changes renaming the label `from` to `to` everywhere it's defined or referred to. */
export function renameKeyChanges(text: string, from: string, to: string): { from: number; to: number; insert: string }[] {
  return keySpans(normalizeEol(text))
    .filter((s) => s.key === from)
    .map((s) => ({ from: s.from, to: s.to, insert: to }))
}
