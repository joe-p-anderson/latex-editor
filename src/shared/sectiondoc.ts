// The document a section preview compiles: the paper's root with everything
// in its body blanked except the one \input being previewed, and the
// counters set to where that file starts, so its sections, equations and
// figures come out numbered as in the whole paper. Lines are blanked, not
// removed, so a line of this document is the same line of the root.
import type { Counters } from './livemodel'

/**
 * The section document for the include on `includeLine` (1-based) of
 * `rootText`, starting at counters `start`. Null when that line isn't in the
 * root's body.
 */
export function sectionDocument(rootText: string, includeLine: number, start: Counters): string | null {
  const lines = rootText.split('\n')
  const begin = lines.findIndex((l) => /^[^%]*\\begin\s*\{document\}/.test(l))
  const end = lines.findIndex((l, i) => i > begin && /^[^%]*\\end\s*\{document\}/.test(l))
  const at = includeLine - 1
  if (begin < 0 || end < 0 || at <= begin || at >= end) return null
  const set = (counter: string, n: number) => `\\setcounter{${counter}}{${n}}`
  const counters = [
    // \appendix first: it resets the section counter itself.
    ...(start.appendix ? ['\\appendix'] : []),
    ...(start.hasChapters ? [set('chapter', start.sec[0])] : []),
    set('section', start.sec[1]),
    set('subsection', start.sec[2]),
    set('subsubsection', start.sec[3]),
    set('equation', start.equation),
    set('figure', start.figure),
    set('table', start.table),
  ].join('')
  const out = lines.map((l, i) => {
    if (i <= begin || i >= end) return l
    if (i === at) return `${counters}${l.replace(/^\s*/, '')}`
    // Keep the line break (and a \r, for a CRLF file), drop the rest.
    return l.endsWith('\r') ? '\r' : ''
  })
  return out.join('\n')
}

/** \label keys defined in `text` (outside comments). */
export const labelsIn = (text: string): string[] =>
  [...text.replace(/(?<!\\)%[^\n]*/g, '').matchAll(/\\label\s*\{([^}]+)\}/g)].map((m) => m[1].trim())
