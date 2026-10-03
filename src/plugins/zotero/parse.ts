// Reading what Zotero and Better BibTeX answer, and small helpers around it.
// Pure (no Node, no DOM); tests/zotero.test.ts feeds it recorded responses.
import { entryKey } from './bib'

/** A reference in Zotero's library, as the cite picker needs it. */
export interface Ref {
  /** Zotero's item key (stable). */
  id: string
  /** The citation key; '' when Zotero has none and no key can be made. */
  key: string
  title: string
  /** Surnames, comma separated. */
  authors: string
  year: string
  /** Journal, book or publisher. */
  venue: string
}

/** The result of a JSON-RPC call: its value, or the error's message thrown. */
export function parseRpc<T = unknown>(body: string): T {
  let r: { result?: T; error?: { message?: string } }
  try {
    r = JSON.parse(body)
  } catch {
    throw new Error('Zotero answered with something that is not JSON')
  }
  if (r.error) throw new Error(r.error.message ?? 'Better BibTeX reported an error')
  return r.result as T
}

type Obj = Record<string, any>

const surnames = (people: Obj[] | undefined) =>
  (people ?? [])
    .map((p) => String(p.family ?? p.lastName ?? p.name ?? p.literal ?? '').trim())
    .filter(Boolean)
    .join(', ')

/** The last path segment of Zotero's item URL (`http://zotero.org/users/1/items/ABCD1234`). */
const idOf = (url: string) => url.slice(url.lastIndexOf('/') + 1)

/** Refs from Better BibTeX's `item.search` (CSL JSON). Attachments and notes have no citation key and are dropped. */
export function refsFromBbt(result: unknown): Ref[] {
  if (!Array.isArray(result)) return []
  const out: Ref[] = []
  for (const it of result as Obj[]) {
    const key = String(it['citation-key'] ?? it.citekey ?? '')
    if (!key || typeof it.id !== 'string') continue
    out.push({
      id: idOf(it.id),
      key,
      title: String(it.title ?? ''),
      authors: surnames(it.author ?? it.editor),
      year: String(it.issued?.['date-parts']?.[0]?.[0] ?? ''),
      venue: String(it['container-title'] ?? it.publisher ?? ''),
    })
  }
  return out
}

/** The BibTeX the local API sent along with an item (`include=bibtex`), by item key. */
export type ApiRef = Ref & { bibtex: string }

/** Refs from the local API's `items?include=data,bibtex`. Attachments, notes and annotations are dropped. */
export function refsFromApi(items: unknown): ApiRef[] {
  if (!Array.isArray(items)) return []
  const out: ApiRef[] = []
  for (const it of items as Obj[]) {
    const d = it.data ?? {}
    if (/^(attachment|note|annotation)$/.test(d.itemType)) continue
    const bibtex = typeof it.bibtex === 'string' ? it.bibtex : ''
    const key = String(d.citationKey || entryKey(bibtex) || '')
    out.push({
      id: String(it.key ?? d.key ?? ''),
      key,
      title: String(d.title ?? ''),
      authors: surnames((d.creators ?? []).filter((c: Obj) => c.creatorType === 'author' || c.creatorType === 'editor')),
      year: /\d{4}/.exec(String(it.meta?.parsedDate ?? d.date ?? ''))?.[0] ?? '',
      venue: String(d.publicationTitle ?? d.bookTitle ?? d.proceedingsTitle ?? d.publisher ?? ''),
      bibtex,
    })
  }
  return out.filter((r) => r.id)
}

/** The keys in CAYW's `format=latex` answer (`\cite{a,b}`, possibly several commands). Empty when the picker was cancelled. */
export function keysFromCayw(text: string): string[] {
  const keys: string[] = []
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) for (const k of m[1].split(',')) if (k.trim() && !keys.includes(k.trim())) keys.push(k.trim())
  return keys
}

/** The keys a build's .aux cites, sorted: BibTeX's `\citation{a,b}` and biblatex's `\abx@aux@cite{0}{a}`. */
export function citedKeysFromAux(aux: string): string[] {
  const keys = new Set<string>()
  for (const m of aux.matchAll(/\\citation\{([^}]*)\}/g)) for (const k of m[1].split(',')) keys.add(k.trim())
  for (const m of aux.matchAll(/\\abx@aux@cite\{[^}]*\}\{([^}]*)\}/g)) keys.add(m[1].trim())
  keys.delete('')
  keys.delete('*')
  return [...keys].sort()
}

/** Whether two sorted key lists differ. */
export const keysChanged = (before: string[] | null, after: string[]) => !before || before.length !== after.length || before.some((k, i) => k !== after[i])

/** The collection's path: `{vault}` and `{document}` filled in, empty parts and edge slashes dropped. */
export function collectionPath(pattern: string, vault: string, document: string): string {
  return pattern
    .replace(/\{vault\}/g, vault)
    .replace(/\{document\}/g, document)
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/')
}

/** The key of an "undefined citation" problem that names a key with no entry, else null. */
export function missingKey(p: { rule: string; title: string }): string | null {
  return p.rule === 'undefined-citation' ? (/^No bibliography entry "(.+)"$/.exec(p.title)?.[1] ?? null) : null
}
