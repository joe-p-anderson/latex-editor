// Finds the math in a LaTeX document: $...$, $$...$$, \(...\), \[...\] and
// display environments (equation, align, gather, ...). Used by the editor to
// know what to preview, and by the tests to render every equation in the
// fixtures. Comments, escaped \$ and verbatim environments are skipped.

export interface MathRegion {
  /** Offsets into the document: the whole region, delimiters included. */
  from: number
  to: number
  /** What to hand MathJax: the inner TeX, or the whole \begin...\end for environments. */
  tex: string
  display: boolean
  /** False when the math runs to the end of its paragraph without closing (still being typed). */
  closed: boolean
}

const DISPLAY_ENVS = /^(equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math)\*?$/
const VERBATIM_ENVS = /^(verbatim|Verbatim|lstlisting|minted|comment)\*?$/

export function findMathRegions(text: string): MathRegion[] {
  const regions: MathRegion[] = []
  const n = text.length
  let i = 0

  // Position of the next blank line (paragraph end) at or after `from`.
  const paragraphEnd = (from: number) => {
    const m = /\n[ \t]*\r?\n/g
    m.lastIndex = from
    return m.exec(text)?.index ?? n
  }

  while (i < n) {
    const ch = text[i]

    if (ch === '%') {
      // Comment: skip to end of line.
      const nl = text.indexOf('\n', i)
      i = nl < 0 ? n : nl + 1
      continue
    }

    if (ch === '\\') {
      const next = text[i + 1]
      if (next === '(' || next === '[') {
        const close = next === '(' ? '\\)' : '\\]'
        const end = findClose(text, i + 2, close, paragraphEnd(i))
        regions.push(region(i, end, i + 2, close.length, next === '['))
        i = end.closed ? end.at + close.length : end.at
        continue
      }
      const env = /^\\begin\{([^}]+)\}/.exec(text.slice(i, i + 40))
      if (env && (DISPLAY_ENVS.test(env[1]) || VERBATIM_ENVS.test(env[1]))) {
        const endTag = `\\end{${env[1]}}`
        const endAt = text.indexOf(endTag, i + env[0].length)
        const stop = endAt < 0 ? n : endAt + endTag.length
        if (DISPLAY_ENVS.test(env[1])) {
          regions.push({ from: i, to: stop, tex: text.slice(i, stop), display: true, closed: endAt >= 0 })
        }
        i = stop
        continue
      }
      i += 2 // an escaped character (\$, \%, \\) or the start of a command
      continue
    }

    if (ch === '$') {
      const display = text[i + 1] === '$'
      const open = display ? 2 : 1
      const end = findClose(text, i + open, display ? '$$' : '$', display ? n : paragraphEnd(i))
      regions.push(region(i, end, i + open, open, display))
      i = end.closed ? end.at + open : end.at
      continue
    }
    i++
  }
  return regions

  function region(from: number, end: { at: number; closed: boolean }, inner: number, closeLen: number, display: boolean): MathRegion {
    return {
      from,
      to: end.closed ? end.at + closeLen : end.at,
      tex: text.slice(inner, end.at),
      display,
      closed: end.closed,
    }
  }
}

/** Finds `close` from `start`, skipping escapes and comments, stopping at `limit`. */
function findClose(text: string, start: number, close: string, limit: number): { at: number; closed: boolean } {
  let i = start
  while (i < limit) {
    const ch = text[i]
    if (ch === '\\') {
      if (text.startsWith(close, i)) return { at: i, closed: true }
      i += 2
      continue
    }
    if (ch === '%') {
      const nl = text.indexOf('\n', i)
      i = nl < 0 ? limit : nl + 1
      continue
    }
    if (text.startsWith(close, i)) return { at: i, closed: true }
    i++
  }
  // Unclosed: the region runs to the paragraph end, trimmed of trailing blanks.
  let at = Math.min(limit, text.length)
  while (at > start && /\s/.test(text[at - 1])) at--
  return { at, closed: false }
}

/** The region containing offset `pos` (delimiters count as inside), if any. */
export function regionAt(regions: MathRegion[], pos: number): MathRegion | undefined {
  // Regions are sorted and non-overlapping: binary search.
  let lo = 0
  let hi = regions.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = regions[mid]
    if (pos < r.from) hi = mid - 1
    else if (pos > r.to) lo = mid + 1
    else return r
  }
  return undefined
}
