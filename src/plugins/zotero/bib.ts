// Editing a .bib file that holds both hand-written entries and entries this
// plugin copied from Zotero. Pure (no Node, no DOM).
//
// Marking scheme: each entry the plugin writes is preceded by one comment line,
//   % zotero: ABCD1234
// where ABCD1234 is the Zotero item key. A comment line is plain BibTeX (it is
// ignored outside entries), it is visible to the person reading the file, it
// travels with the .bib to other machines, and it survives a hand edit of the
// entry. A key list in the cache folder would be lost with it and could
// disagree with the file. Anything without the marker is never touched.
import { blankComments } from '../../shared/latexedit'

/** One @type{…} block in a .bib file. */
export interface BibSpan {
  /** Entry type, lower case. */
  type: string
  /** Citation key; '' for @string, @comment and @preamble. */
  key: string
  /** Offset of the `@`. */
  entryStart: number
  /** Start of the span: the marker line when there is one, else `entryStart`. */
  start: number
  /** Offset just after the closing brace (the line break after it is not included). */
  end: number
  /** The Zotero item key from the marker line, or null for a hand-written entry. */
  zotero: string | null
}

const MARKER = /^[ \t]*%[ \t]*zotero:[ \t]*(\S+)[ \t]*\r?\n$/

/** The marker line for a Zotero item. */
export const markerLine = (id: string) => `% zotero: ${id}`

/** Every entry of the file in order, with its marker if it has one. Text between entries is never part of a span. */
export function scanEntries(text: string): BibSpan[] {
  const out: BibSpan[] = []
  const head = /^[ \t]*(@[A-Za-z]+)[ \t]*([{(])/gm
  let m: RegExpExecArray | null
  while ((m = head.exec(text))) {
    const entryStart = m.index + m[0].indexOf('@')
    const open = m[2]
    const close = open === '{' ? '}' : ')'
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === '\\') i++
      else if (c === open) depth++
      else if (c === close && --depth === 0) break
    }
    if (depth !== 0) break // unterminated: leave the rest alone
    const end = i + 1
    head.lastIndex = end
    const type = m[1].slice(1).toLowerCase()
    const key = /^(?:string|comment|preamble)$/.test(type) ? '' : (/^\s*([^,\s]+)\s*,/.exec(text.slice(m.index + m[0].length, m.index + m[0].length + 300))?.[1] ?? '')
    // The line before the entry, if it is a marker.
    const lineStart = text.lastIndexOf('\n', entryStart - 1) + 1
    const prevStart = lineStart > 0 ? text.lastIndexOf('\n', lineStart - 2) + 1 : lineStart
    const prev = lineStart > 0 ? text.slice(prevStart, lineStart) : ''
    const marker = MARKER.exec(prev)
    out.push({ type, key, entryStart, start: marker ? prevStart : lineStart, end, zotero: marker ? marker[1] : null })
  }
  return out
}

/** The citation key of the first entry in `bibtex`, or null. */
export function entryKey(bibtex: string): string | null {
  return scanEntries(bibtex).find((s) => s.key)?.key ?? null
}

/** The entry blocks in `bibtex` by citation key (an export may hold several). */
export function splitEntries(bibtex: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of scanEntries(bibtex)) if (s.key) out[s.key] = bibtex.slice(s.entryStart, s.end)
  return out
}

/**
 * An entry ready for the vault: line breaks as `\n`, no `file` field (it is a
 * path on the machine Zotero runs on), trimmed. With `key`, the entry is renamed.
 */
export function normalizeEntry(bibtex: string, key?: string): string {
  let t = bibtex.replace(/\r\n?/g, '\n').trim()
  t = t.replace(/^[ \t]*file[ \t]*=.*\n?/gm, '')
  if (key) t = t.replace(/^(@[A-Za-z]+[ \t]*[{(][ \t]*)[^,\s]+/, `$1${key}`)
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

/** An item to put in the file. */
export interface BibItem {
  /** The Zotero item key. */
  id: string
  key: string
  bibtex: string
}

export type UpsertStatus =
  /** Appended as a new entry. */
  | 'added'
  /** An entry the plugin wrote earlier, replaced with Zotero's current text. */
  | 'updated'
  /** The plugin's entry already matches. */
  | 'unchanged'
  /** The key is taken by a hand-written entry, which was left alone. */
  | 'exists'
  /** Zotero's key for this item is no longer the key in the file, so the entry was left as it is. */
  | 'renamed'

export interface UpsertResult {
  key: string
  id: string
  status: UpsertStatus
}

export interface UpsertOptions {
  /** Replace entries the plugin wrote earlier (a sync). Without it they are reported 'unchanged'. */
  refresh?: boolean
  /** Keys are not stable in this source, so a refresh keeps the key in the file. */
  keepKeys?: boolean
}

/**
 * Adds `items` to the file's text. New ones go at the end; with `refresh`,
 * entries marked for the same item are replaced in place. Hand-written
 * entries and all other text stay byte for byte as they were.
 */
export function upsertEntries(text: string, items: BibItem[], opts: UpsertOptions = {}): { text: string; results: UpsertResult[] } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const spans = scanEntries(text)
  const taken = new Set(spans.filter((s) => s.key).map((s) => s.key.toLowerCase()))
  const results: UpsertResult[] = []
  const replace: { start: number; end: number; text: string }[] = []
  let append = ''
  const seen = new Set<string>()
  for (const item of items) {
    const result = (status: UpsertStatus) => results.push({ key: item.key, id: item.id, status })
    const own = spans.find((s) => s.zotero === item.id)
    if (own) {
      const key = opts.keepKeys ? own.key : item.key
      if (!opts.refresh) result('unchanged')
      else if (own.key.toLowerCase() !== key.toLowerCase()) {
        results.push({ key: own.key, id: item.id, status: 'renamed' })
      } else {
        const next = normalizeEntry(item.bibtex, key)
        const block = `${markerLine(item.id)}\n${next}`.replace(/\n/g, eol)
        const same = block === text.slice(own.start, own.end)
        results.push({ key, id: item.id, status: same ? 'unchanged' : 'updated' })
        if (!same) replace.push({ start: own.start, end: own.end, text: block })
      }
      continue
    }
    const k = item.key.toLowerCase()
    if (taken.has(k) || seen.has(k)) {
      result('exists')
      continue
    }
    seen.add(k)
    append += `${eol}${markerLine(item.id)}${eol}${normalizeEntry(item.bibtex).replace(/\n/g, eol)}${eol}`
    result('added')
  }
  let out = text
  for (const r of replace.sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + r.text + out.slice(r.end)
  if (append) {
    if (out.length && !out.endsWith('\n')) out += eol
    // A blank line between entries; the first entry of an empty file starts it.
    out += out.length ? append : append.slice(eol.length)
  }
  return { text: out, results }
}

/** Only the text `upsertEntries` would add at the end (for an append edit). */
export function appendFor(text: string, items: BibItem[]): string {
  const { text: next } = upsertEntries(text, items)
  return next.slice(text.length)
}

// --- Finding the document's .bib ---------------------------------------------

/** The .bib names a document asks for, as written (with `.bib` added), in order. */
export function bibNamesIn(tex: string): string[] {
  const src = blankComments(tex)
  const out: string[] = []
  const add = (name: string) => {
    const n = name.trim()
    if (n) out.push(/\.bib$/i.test(n) ? n : `${n}.bib`)
  }
  for (const m of src.matchAll(/\\bibliography\s*\{([^}]*)\}/g)) m[1].split(',').forEach(add)
  for (const m of src.matchAll(/\\(?:addbibresource|addglobalbib|addsectionbib)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) add(m[1])
  return out
}

/** Whether the document is set up for biblatex rather than BibTeX. */
export const usesBiblatex = (tex: string) => /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\bbiblatex\b[^}]*\}/.test(blankComments(tex))

/**
 * The edit that makes the document use `bib` (vault-relative, relative to the
 * document's folder `dir`), or null when it already names a .bib or has no
 * place to put one. Offsets are into `tex` with `\n` line breaks.
 */
export function bibDeclaration(tex: string, bib: string, dir = ''): { from: number; to: number; insert: string } | null {
  if (bibNamesIn(tex).length) return null
  const src = blankComments(tex)
  const rel = dir && bib.startsWith(`${dir}/`) ? bib.slice(dir.length + 1) : bib
  if (usesBiblatex(tex)) {
    const at = /^[ \t]*\\begin\s*\{document\}/m.exec(src)
    return at ? { from: at.index, to: at.index, insert: `\\addbibresource{${rel}}\n` } : null
  }
  const at = /^[ \t]*\\end\s*\{document\}/m.exec(src)
  if (!at) return null
  const revtex = /\\documentclass(?:\s*\[[^\]]*\])?\s*\{revtex/.test(src)
  const style = revtex || /\\bibliographystyle\s*\{/.test(src) ? '' : '\\bibliographystyle{plain}\n'
  return { from: at.index, to: at.index, insert: `${style}\\bibliography{${rel.replace(/\.bib$/i, '')}}\n\n` }
}
