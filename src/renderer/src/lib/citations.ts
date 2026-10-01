// The open document's bibliography, as the editor's pieces use it: the
// cite picker, \cite completion, hover cards and the live view's chips.
import type { BibInfo } from '@shared/api'
import type { BibSummary } from '@shared/bibtex'

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
