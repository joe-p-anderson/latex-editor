// The open document's bibliography, as the editor's pieces use it: the
// cite picker, \cite completion, hover cards and the live view's chips.
import type { BibInfo } from '@shared/api'
import type { BibSummary } from '@shared/bibtex'
import type { CiteMenuItem } from './CiteMenu.svelte'
import type { CiteHit, CiteSource } from './plugins.svelte'

export interface Citations {
  info: BibInfo
  byKey: Map<string, BibSummary>
}

export function makeCitations(info: BibInfo): Citations {
  return { info, byKey: new Map(info.entries.map((e) => [e.key, e])) }
}

/** Ctrl+click on a cite chip: open a file at a line (the entry in its .bib). */
export const OPEN_LOCATION_EVENT = 'latex-open-location'
export interface OpenLocation {
  file: string
  line: number
}

/** A reference the cite picker or the Citations view lists: in the bibliography, or a plugin source's hit (not yet). */
export type CiteRow = { kind: 'bib'; entry: BibSummary } | { kind: 'source'; source: CiteSource; hit: CiteHit }

/**
 * Asks every source for `query` (two characters or more), leaving out hits
 * whose key the bibliography has already. A source that fails counts as none.
 */
export async function searchSources(sources: CiteSource[], query: string, info: BibInfo | null): Promise<CiteRow[]> {
  const q = query.trim()
  if (q.length < 2 || !sources.length) return []
  const known = new Set((info?.entries ?? []).map((e) => e.key))
  const found = await Promise.all(sources.map(async (source) => ({ source, hits: await source.search(q).catch(() => [] as CiteHit[]) })))
  return found.flatMap(({ source, hits }) => hits.filter((h) => !h.key || !known.has(h.key)).map((hit): CiteRow => ({ kind: 'source', source, hit })))
}

/** What the right-click menu of `row` says and offers. */
export function citeMenu(
  row: CiteRow,
  act: { insert: () => void; show: (file: string, line: number) => void; add: () => void },
): { who: string; where: string; items: CiteMenuItem[] } {
  const fileName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)
  const key = row.kind === 'bib' ? row.entry.key : (row.hit.key ?? '…')
  const insert: CiteMenuItem = { label: 'Insert', code: `\\cite{${key}}`, after: row.kind === 'source' ? ', adding it to the bibliography' : '', run: act.insert }
  if (row.kind === 'bib') {
    const e = row.entry
    return {
      who: `${e.author || '(no author)'}${e.year ? ` ${e.year}` : ''}`,
      where: `In ${fileName(e.file)}`,
      items: [insert, { label: `Show in ${fileName(e.file)}`, run: () => act.show(e.file, e.line) }],
    }
  }
  const h = row.hit
  return {
    who: `${h.authors || '(no author)'}${h.year ? ` ${h.year}` : ''}`,
    where: `In ${row.source.label}, not in the bibliography yet`,
    items: [insert, { label: 'Add to the bibliography', run: act.add }],
  }
}
