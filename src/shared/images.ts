// Image helpers shared by the picker, the editor and the tests.

/** Files \includegraphics can use (pdfLaTeX), plus SVG and GIF for previewing. */
export const IMAGE_EXT = /\.(png|jpe?g|pdf|gif|svg|eps)$/i
/** Formats pdfLaTeX's \includegraphics accepts directly. */
export const PDFLATEX_IMAGE = /\.(png|jpe?g|pdf)$/i

export const isImage = (path: string) => IMAGE_EXT.test(path)

/**
 * Fuzzy match score of `query` against `path`, higher is better, or null if
 * the query's characters don't all appear in order. Rewards matches at word
 * starts (after / _ - . or a space) and consecutive runs, and matches in the
 * file name over the folder, so "mir" ranks Images/mirror.png first.
 */
export function fuzzyScore(query: string, path: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return 0
  const p = path.toLowerCase()
  const nameStart = p.lastIndexOf('/') + 1
  let score = 0
  let pi = 0
  let run = 0
  for (const ch of q) {
    const found = p.indexOf(ch, pi)
    if (found < 0) return null
    const wordStart = found === 0 || '/_-. '.includes(p[found - 1])
    run = found === pi ? run + 1 : 0
    score += 1 + (wordStart ? 3 : 0) + run * 2 + (found >= nameStart ? 1 : 0)
    pi = found + 1
  }
  // Shorter paths win ties: the query covers more of them.
  return score - p.length * 0.01
}

/**
 * The paths matching `query`, best first. A query without "/" is matched
 * against file names only (as in Obsidian): otherwise the shared "Images/"
 * prefix would let almost any query match almost any file.
 */
export function fuzzyFilter(query: string, paths: string[]): string[] {
  const byPath = query.includes('/')
  return paths
    .map((p) => ({ p, s: fuzzyScore(query, byPath ? p : p.slice(p.lastIndexOf('/') + 1)) }))
    .filter((x): x is { p: string; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.p.localeCompare(b.p))
    .map((x) => x.p)
}

/**
 * If `pos` is inside the path argument of an \includegraphics on this line,
 * where that argument starts and ends (offsets within `line`) and its text.
 */
export function includegraphicsArgAt(line: string, pos: number): { from: number; to: number; text: string } | null {
  // The argument stops at } or at a backslash: while it is still being typed
  // (no closing brace yet), the next command must not be read as part of it.
  // Spaces are allowed, since image names like "Car figure.pdf" have them.
  const re = /\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}\\]*)\}?/g
  for (const m of line.matchAll(re)) {
    const from = m.index! + m[0].indexOf('{', m[0].indexOf('includegraphics')) + 1
    const to = from + m[1].length
    if (pos >= from && pos <= to) return { from, to, text: m[1] }
  }
  return null
}

/** A LaTeX-friendly file name: no spaces or characters TeX treats specially. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
  const clean = stem.replace(/[\s#%&$^{}~\\]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'image'
  return clean + ext
}

/** URL the renderer uses to load a vault file (served by main/index.ts). */
export const vaultUrl = (rel: string) => `vault://files/${rel.split('/').map(encodeURIComponent).join('/')}`
