// Inline code: \verb|…|, \verb*|…|, \lstinline[opts]!…! or {…}, and
// \mintinline[opts]{lang}!…! or {…}. Its contents are code, never scanned for
// commands, math or environments, so everything that tokenises source skips
// these spans. A span lies on one line; one with no closing delimiter before
// the line ends is not a span.

export interface CodeSpan {
  /** The whole span, command and delimiters included. */
  from: number
  to: number
  /** Just the contents, between the delimiters. */
  bodyFrom: number
  bodyTo: number
}

const COMMAND = /\\(verb\*?|lstinline|mintinline)(?![A-Za-z@])/y

/** The inline code spans in `text`, in order. A `%` outside one starts a comment; inside one it doesn't. */
export function codeSpans(text: string): CodeSpan[] {
  const out: CodeSpan[] = []
  if (!/\\(?:verb|lstinline|mintinline)/.test(text)) return out
  const n = text.length
  let i = 0
  while (i < n) {
    const ch = text[i]
    if (ch === '%') {
      const nl = text.indexOf('\n', i)
      i = nl < 0 ? n : nl + 1
      continue
    }
    if (ch !== '\\') {
      i++
      continue
    }
    COMMAND.lastIndex = i
    const m = COMMAND.exec(text)
    const span = m ? spanAt(text, i, m[1], i + m[0].length) : null
    if (span) {
      out.push(span)
      i = span.to
    } else i += 2 // an escaped character (\%, \\) or the start of another command
  }
  return out
}

/** Whether `pos` is inside one of `spans` (sorted, as codeSpans returns them). */
export function inSpan(spans: readonly CodeSpan[], pos: number): boolean {
  let lo = 0
  let hi = spans.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pos < spans[mid].from) hi = mid - 1
    else if (pos >= spans[mid].to) lo = mid + 1
    else return true
  }
  return false
}

/**
 * A forward cursor over `spans` (sorted): called with positions that never
 * go back, it returns the span each lies in, or null. For a single pass over
 * the text, where inSpan's search each time would be wasted.
 */
export function spanCursor(spans: readonly CodeSpan[]): (pos: number) => CodeSpan | null {
  let i = 0
  return (pos) => {
    while (i < spans.length && spans[i].to <= pos) i++
    return i < spans.length && spans[i].from <= pos ? spans[i] : null
  }
}

function spanAt(text: string, from: number, cmd: string, at: number): CodeSpan | null {
  let j = at
  const lineEnd = text.indexOf('\n', at) < 0 ? text.length : text.indexOf('\n', at)
  if (cmd !== 'verb' && cmd !== 'verb*') {
    const o = /^[ \t]*\[[^\]\n]*\]/.exec(text.slice(j, lineEnd))
    if (o) j += o[0].length
    if (cmd === 'mintinline') {
      const lang = /^[ \t]*\{[^}\n]*\}/.exec(text.slice(j, lineEnd))
      if (!lang) return null
      j += lang[0].length
    }
    if (text[j] === '{') {
      let depth = 0
      for (let k = j; k < lineEnd; k++) {
        if (text[k] === '{') depth++
        else if (text[k] === '}' && --depth === 0) return { from, to: k + 1, bodyFrom: j + 1, bodyTo: k }
      }
      return null
    }
  }
  const d = text[j]
  if (j >= lineEnd || /[\sA-Za-z]/.test(d) || (cmd !== 'verb' && d === '{')) return null
  const close = text.indexOf(d, j + 1)
  if (close < 0 || close >= lineEnd) return null
  return { from, to: close + 1, bodyFrom: j + 1, bodyTo: close }
}
