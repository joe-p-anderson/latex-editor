// Reading .bib files and what BibTeX leaves behind: the entries (for the
// cite picker, completion and hover cards), the labels LaTeX gives each
// citation (from \bibcite in the .aux), and the messages in a .blg log.
// Kept free of Node and the DOM so it can be unit tested and used anywhere.

export interface BibEntry {
  /** Lower-case entry type: article, book, … */
  type: string
  key: string
  /** 1-based line of the @type{ that starts the entry. */
  line: number
  /** Field name (lower case) → raw value, braces kept, @string macros expanded. */
  fields: Record<string, string>
}

/** What the editor shows of an entry: the plain-text fields it needs. */
export interface BibSummary {
  key: string
  type: string
  /** Short author list: "Anderson", "Anderson and El-Azab", "Anderson et al." */
  author: string
  /** Every author's surname, for searching. */
  authors: string
  year: string
  title: string
  /** Journal, book, conference or publisher: where it appeared. */
  venue: string
  /** Keywords (Zotero exports tags here). */
  tags: string[]
  /** Vault-relative .bib file, and the entry's line in it. */
  file: string
  line: number
}

const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
}

/**
 * The entries of a .bib file, in order. @string macros are expanded and
 * `#` concatenations joined; @comment, @preamble and text between entries
 * are skipped. A malformed entry is skipped, not fatal: BibTeX reports it.
 */
export function parseBib(text: string): BibEntry[] {
  const entries: BibEntry[] = []
  const strings: Record<string, string> = { ...MONTHS }
  const lineStarts: number[] = [0]
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1)
  const lineOf = (pos: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  const at = /@\s*([A-Za-z]+)\s*([{(])/g
  for (let m = at.exec(text); m; m = at.exec(text)) {
    const type = m[1].toLowerCase()
    const open = m.index + m[0].length - 1
    const close = matchingClose(text, open)
    if (close < 0) break
    at.lastIndex = close + 1
    if (type === 'comment' || type === 'preamble') continue
    const body = text.slice(open + 1, close)
    if (type === 'string') {
      for (const [name, value] of fieldsOf(body, strings)) strings[name] = value
      continue
    }
    const comma = body.indexOf(',')
    const key = (comma < 0 ? body : body.slice(0, comma)).trim()
    if (!key || /[\s{}]/.test(key)) continue
    const fields: Record<string, string> = {}
    if (comma >= 0) for (const [name, value] of fieldsOf(body.slice(comma + 1), strings)) fields[name] = value
    entries.push({ type, key, line: lineOf(m.index), fields })
  }
  return entries
}

/** The close of the { or ( at `open`, counting braces; -1 if unclosed. */
function matchingClose(text: string, open: number): number {
  const closer = text[open] === '(' ? ')' : '}'
  let depth = 0
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '{') depth++
    else if (c === '}') {
      if (depth === 0) return closer === '}' ? i : -1
      depth--
    } else if (c === closer && depth === 0) return i
  }
  return -1
}

/** `name = value` pairs of an entry body (after its key), values expanded. */
function* fieldsOf(body: string, strings: Record<string, string>): Generator<[string, string]> {
  let i = 0
  while (i < body.length) {
    const m = /^[\s,]*([A-Za-z][\w:.+-]*)\s*=\s*/.exec(body.slice(i))
    if (!m) return
    i += m[0].length
    const parts: string[] = []
    for (;;) {
      const c = body[i]
      if (c === '{') {
        let depth = 0
        let j = i
        for (; j < body.length; j++) {
          if (body[j] === '{') depth++
          else if (body[j] === '}' && --depth === 0) break
        }
        parts.push(body.slice(i + 1, j))
        i = j + 1
      } else if (c === '"') {
        let depth = 0
        let j = i + 1
        for (; j < body.length; j++) {
          if (body[j] === '{') depth++
          else if (body[j] === '}') depth--
          else if (body[j] === '"' && depth === 0) break
        }
        parts.push(body.slice(i + 1, j))
        i = j + 1
      } else {
        const word = /^[^\s,#}]+/.exec(body.slice(i))?.[0] ?? ''
        if (!word) break
        parts.push(/^\d+$/.test(word) ? word : (strings[word.toLowerCase()] ?? word))
        i += word.length
      }
      const hash = /^\s*#\s*/.exec(body.slice(i))
      if (!hash) break
      i += hash[0].length
    }
    yield [m[1].toLowerCase(), parts.join('')]
  }
}

const ACCENTS: Record<string, Record<string, string>> = {
  '"': { a: 'ä', o: 'ö', u: 'ü', e: 'ë', i: 'ï', A: 'Ä', O: 'Ö', U: 'Ü' },
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', c: 'ć', n: 'ń', s: 'ś', z: 'ź', E: 'É', A: 'Á' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  '~': { a: 'ã', n: 'ñ', o: 'õ' },
  c: { c: 'ç', C: 'Ç' },
  v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž' },
}

/** A field as plain text: accents resolved, braces and simple commands dropped. */
export function plainField(value: string): string {
  return value
    .replace(/\\([`'^"~])\s*\{?\\?([A-Za-z])\}?/g, (m, a: string, c: string) => ACCENTS[a]?.[c] ?? c)
    .replace(/\\([cv])\s*\{([A-Za-z])\}/g, (m, a: string, c: string) => ACCENTS[a]?.[c] ?? c)
    .replace(/\\(ss|o|O|l|L|ae|AE|aa|AA)(?![A-Za-z])\s*/g, (m, c: string) => ({ ss: 'ß', o: 'ø', O: 'Ø', l: 'ł', L: 'Ł', ae: 'æ', AE: 'Æ', aa: 'å', AA: 'Å' })[c] ?? c)
    .replace(/\\(?:textit|textbf|emph|textrm|mathrm|text)\s*\{/g, '{')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/--/g, '–')
    .replace(/~/g, ' ')
    .replace(/\\[A-Za-z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The surnames in a BibTeX author list ("Last, First and First Last and {Org Name}"). */
export function surnames(author: string): string[] {
  const names = splitTop(author, /\s+and\s+/)
  return names
    .map((n) => {
      const name = n.trim()
      if (/^\{.*\}$/.test(name) && !name.includes(',')) return plainField(name) // {Some Organisation}
      const parts = splitTop(name, /\s*,\s*/)
      if (parts.length > 1) return plainField(parts[0])
      // "First von Last": the last word, or from the first lower-case particle.
      const words = splitTop(name, /\s+/)
      const von = words.findIndex((w, i) => i > 0 && i < words.length - 1 && /^[a-z]/.test(w))
      return plainField(words.slice(von > 0 ? von : words.length - 1).join(' '))
    })
    .filter((s) => s && s.toLowerCase() !== 'others')
}

/** "Anderson", "Anderson and El-Azab", or "Anderson et al." */
export function authorsShort(author: string): string {
  const s = surnames(author)
  if (s.length === 0) return ''
  if (s.length === 1) return s[0]
  if (s.length === 2) return `${s[0]} and ${s[1]}`
  return `${s[0]} et al.`
}

/** Splits `s` at `sep` where it isn't inside braces. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  const re = new RegExp(sep.source, 'g')
  // Walk character by character, trying the separator only at depth 0.
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0) {
      re.lastIndex = i
      const m = re.exec(s)
      if (m && m.index === i && m[0].length) {
        out.push(s.slice(start, i))
        start = i + m[0].length
        i = start - 1
      }
    }
  }
  out.push(s.slice(start))
  return out.filter((p) => p !== '')
}

/** What the editor shows of an entry from `file` (vault-relative). */
export function summarize(e: BibEntry, file: string): BibSummary {
  const f = e.fields
  const author = f.author ?? f.editor ?? ''
  const year = plainField(f.year ?? (f.date ?? '').slice(0, 4))
  const venue = plainField(f.journal ?? f.journaltitle ?? f.booktitle ?? f.school ?? f.institution ?? f.publisher ?? f.howpublished ?? '')
  return {
    key: e.key,
    type: e.type,
    author: authorsShort(author),
    authors: surnames(author).join(' '),
    year,
    title: plainField(f.title ?? ''),
    venue: /^https?:/.test(venue) ? '' : venue,
    tags: (f.keywords ?? '').split(/[,;]/).map((t) => plainField(t)).filter(Boolean),
    file,
    line: e.line,
  }
}

/**
 * The label LaTeX prints for each citation, from the .aux: natbib's
 * \bibcite{key}{{1}{2003}{{Kocks}}{{}}} gives "1", a plain \bibcite{key}{3} gives "3".
 */
export function bibciteLabels(aux: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of aux.matchAll(/\\bibcite\{([^}]+)\}\{/g)) {
    const open = m.index! + m[0].length - 1
    const close = matchingClose(aux, open)
    if (close < 0) continue
    let label = aux.slice(open + 1, close)
    const first = /^\{([^{}]*)\}/.exec(label)
    if (first) label = first[1]
    out[m[1]] = plainField(label)
  }
  return out
}

/** Every key cited in LaTeX source (\cite, \citep, \parencite, … with any optional arguments). */
export const CITE_COMMAND = /\\(?:[Cc]ite[a-zA-Z]*|[a-z]*cite[a-z]*|nocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{/

/** Matches a cite command whose key list is still open at the end of `before` (what's typed so far). */
export const OPEN_CITE = /\\(?:[Cc]ite[a-zA-Z]*|[a-z]*cite[a-z]*|nocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]*)$/

/** The keys of every cite command in `text` (comments already blanked by the caller, if wanted). */
export function citedKeys(text: string): string[] {
  const out: string[] = []
  const re = new RegExp(CITE_COMMAND.source + '([^}]*)\\}', 'g')
  for (const m of text.matchAll(re)) for (const k of m[1].split(',')) if (k.trim()) out.push(k.trim())
  return out
}

/**
 * Entries matching `query`: each word must appear in the key, authors,
 * title, year, venue or tags; `#word` must match a tag. Best matches first:
 * a key or surname starting with a word beats a match somewhere in the title.
 */
export function searchBib(entries: BibSummary[], query: string): BibSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  const scored: { e: BibSummary; score: number }[] = []
  for (const e of entries) {
    const key = e.key.toLowerCase()
    const authors = e.authors.toLowerCase()
    const tags = e.tags.map((t) => t.toLowerCase())
    const hay = `${key} ${authors} ${e.title.toLowerCase()} ${e.year} ${e.venue.toLowerCase()} ${tags.join(' ')}`
    let score = 0
    let ok = true
    for (const w of words) {
      if (w.startsWith('#')) {
        const t = w.slice(1)
        if (!t) continue
        // Tag chips add multi-word tags with hyphens: #dislocation-mechanics.
        if (!tags.some((x) => x.replace(/\s+/g, '-').includes(t))) ok = false
        continue
      }
      if (!hay.includes(w)) {
        ok = false
        break
      }
      if (key.startsWith(w)) score += 4
      else if (new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(authors)) score += 3
      else if (e.year === w) score += 2
      else score += 1
    }
    if (ok) scored.push({ e, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.e)
}

export interface BlgMessage {
  severity: 'error' | 'warning'
  message: string
  /** The .bib (or .bst) file named in the message, as written there. */
  file: string | null
  line: number | null
  /** Minor: only shown on request. */
  hidden?: boolean
}

/** The errors and warnings in a BibTeX or biber .blg log. */
export function parseBlg(blg: string): BlgMessage[] {
  const out: BlgMessage[] = []
  const lines = blg.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    let m: RegExpExecArray | null
    // biber: "[123] Utils.pm:… > ERROR - message"
    if ((m = /\b(ERROR|WARN) - (.*)$/.exec(l))) {
      const msg = m[2].trim()
      // Syntax errors name biber's temporary copy: "…subsystem: C:/x/refs.bib_1234.utf8, line 12, …"
      // (older biber: refs.bib_1234.utf8; newer: a hashed name, so the file is unknown here).
      const copy = /subsystem: (.+?)\.utf8, line (\d+)/.exec(msg)
      const named = /file '([^']+)'/.exec(msg)
      const bib = copy && /^(.+?\.bib)_\d+$/.exec(copy[1])
      const file = bib ? bib[1] : named ? named[1] : null
      const line = copy ? Number(copy[2]) : null
      const hidden = m[1] === 'WARN' && /^(Duplicate entry|Overwriting field|Entry .* has characters)/.test(msg)
      out.push({ severity: m[1] === 'ERROR' ? 'error' : 'warning', message: msg, file, line, hidden })
      continue
    }
    // BibTeX: the message, then "---line 12 of file refs.bib" (same line or a following one).
    if ((m = /^(.*?)---line (\d+) of file (.+?)\s*$/.exec(l))) {
      if (/\.aux$/i.test(m[3])) continue // where in the .aux: the message before it says what went wrong
      const text = (m[1] || lines[i - 1] || '').trim()
      out.push({ severity: 'error', message: bibtexMessage(text), file: m[3], line: Number(m[2]) })
      continue
    }
    if ((m = /^I couldn't open (database|style|auxiliary) file (.+?)\s*$/.exec(l))) {
      out.push({ severity: 'error', message: `BibTeX couldn't open the ${m[1] === 'database' ? 'bibliography' : m[1]} file ${m[2]}`, file: m[2], line: null })
      continue
    }
    if ((m = /^I found no \\(bibdata|bibstyle) command/.exec(l))) {
      out.push({ severity: 'error', message: m[1] === 'bibdata' ? 'No \\bibliography{…} names a .bib file' : 'No \\bibliographystyle{…} is given', file: null, line: null })
      continue
    }
    if ((m = /^Warning--(.*)$/.exec(l))) {
      const msg = m[1].trim()
      if (/^I didn't find a database entry/.test(msg)) continue // LaTeX reports the undefined citation itself
      const where = /^--line (\d+) of file (.+?)\s*$/.exec(lines[i + 1] ?? '')
      out.push({ severity: 'warning', message: msg, file: where?.[2] ?? null, line: where ? Number(where[1]) : null, hidden: true })
    }
  }
  return out
}

/** BibTeX's terse syntax errors, in plain words. */
function bibtexMessage(text: string): string {
  if (/^Repeated entry/.test(text)) return 'This key is used by an earlier entry too'
  if (/^I was expecting a `,' or a `\}'/.test(text)) return "BibTeX expected a comma or a closing brace here; a field is probably missing its comma, or a brace isn't closed"
  if (/^I was expecting an "="/.test(text)) return 'BibTeX expected "=" after a field name'
  if (/^Illegal end of database file/.test(text)) return 'The file ends inside an entry; a closing brace is missing'
  if (/^You're missing a field name/.test(text)) return 'A field name is missing'
  if (/^I was expecting a/.test(text)) return `BibTeX ${text.replace(/^I was/, 'was')}`
  return text.replace(/^I /, 'BibTeX ')
}

/** The cite key at column `col` of a line of source, with its span there; null when `col` isn't on one. */
export function citeKeyAt(line: string, col: number): { key: string; from: number; to: number } | null {
  const re = new RegExp(CITE_COMMAND.source, 'g')
  for (const m of line.matchAll(re)) {
    const open = m.index! + m[0].length
    const close = line.indexOf('}', open)
    const end = close < 0 ? line.length : close
    if (col < open || col > end) continue
    let from = open
    for (const part of line.slice(open, end).split(',')) {
      const lead = part.length - part.trimStart().length
      const key = part.trim()
      const a = from + lead
      if (key && col >= a && col <= a + key.length) return { key, from: a, to: a + key.length }
      from += part.length + 1
    }
    return null
  }
  return null
}

/** One line about an entry, for tooltips: "Kocks and Mecking (2003). Title. Journal." */
export function entryText(e: BibSummary): string {
  const who = [e.author, e.year && `(${e.year})`].filter(Boolean).join(' ')
  return [who, e.title, e.venue].filter(Boolean).join('. ') + '.'
}
