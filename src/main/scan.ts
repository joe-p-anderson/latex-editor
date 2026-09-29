// Source scanners for the errors TeX reports far from their cause: an
// unclosed `{` surfaces at the end of the file, an unclosed `$` at the next
// blank line. Scanning the source finds where the problem actually starts.
//
// These are deliberately simple (no macro expansion): comments, escaped
// characters (\{ \} \$ \%) and verbatim-like environments are skipped.

export interface SourcePos {
  line: number // 1-based
  col: number // 0-based
}

const VERBATIM = /^(verbatim|Verbatim|lstlisting|minted|comment)\*?$/

/** Iterates the characters that TeX would treat as code, with positions. */
function* codeChars(text: string): Generator<{ ch: string; i: number; line: number; col: number; lineStart: boolean }> {
  const lines = text.split(/\r?\n/)
  let inVerbatim: string | null = null
  let offset = 0
  for (let ln = 0; ln < lines.length; ln++) {
    const l = lines[ln]
    if (inVerbatim) {
      if (l.includes(`\\end{${inVerbatim}}`)) inVerbatim = null
      offset += l.length + 1
      continue
    }
    const v = /\\begin\{([^}]+)\}/.exec(l)
    if (v && VERBATIM.test(v[1])) {
      inVerbatim = v[1]
      offset += l.length + 1
      continue
    }
    for (let c = 0; c < l.length; c++) {
      const ch = l[c]
      if (ch === '\\') {
        // A control sequence or escaped character: report it as one unit.
        const m = /^\\([A-Za-z@]+\*?|.)/.exec(l.slice(c))!
        yield { ch: m[0], i: offset + c, line: ln + 1, col: c, lineStart: false }
        c += m[0].length - 1
        continue
      }
      if (ch === '%') break // comment to end of line
      yield { ch, i: offset + c, line: ln + 1, col: c, lineStart: c === 0 }
    }
    yield { ch: '\n', i: offset + l.length, line: ln + 1, col: l.length, lineStart: l.trim() === '' }
    offset += l.length + 1
  }
}

export interface BraceReport {
  /** `{` that were never closed, outermost first. */
  unclosed: SourcePos[]
  /** `}` with no matching `{`. */
  extra: SourcePos[]
}

export function scanBraces(text: string): BraceReport {
  const open: SourcePos[] = []
  const extra: SourcePos[] = []
  for (const t of codeChars(text)) {
    if (t.ch === '{') open.push({ line: t.line, col: t.col })
    else if (t.ch === '}') {
      if (open.length) open.pop()
      else extra.push({ line: t.line, col: t.col })
    }
  }
  return { unclosed: open, extra }
}

/**
 * Unclosed `{` within one paragraph (before a blank line). TeX's "Paragraph
 * ended before \x was complete" and runaway arguments stop at the paragraph,
 * and outer braces legitimately span many paragraphs, so this is sharper
 * than a whole-file count.
 */
export function scanParagraphBraces(text: string): SourcePos[] {
  const found: SourcePos[] = []
  let open: SourcePos[] = []
  let blankRun = false
  for (const t of codeChars(text)) {
    if (t.ch === '\n') {
      if (t.lineStart) {
        if (!blankRun && open.length) found.push(open[open.length - 1])
        open = []
        blankRun = true
      }
      continue
    }
    blankRun = false
    if (t.ch === '{') open.push({ line: t.line, col: t.col })
    else if (t.ch === '}') open.pop()
  }
  if (open.length) found.push(open[open.length - 1])
  return found
}

export interface EnvIssue {
  kind: 'mismatch' | 'unclosed' | 'unopened'
  name: string
  at: SourcePos
  /** For a mismatch, where the environment that was actually open began. */
  opened?: { name: string; at: SourcePos }
}

export function scanEnvironments(text: string): EnvIssue[] {
  const issues: EnvIssue[] = []
  const stack: { name: string; at: SourcePos }[] = []
  let pending: 'begin' | 'end' | null = null
  let pendingAt: SourcePos | null = null
  let name = ''
  let collecting = false
  for (const t of codeChars(text)) {
    if (!collecting && (t.ch === '\\begin' || t.ch === '\\end')) {
      pending = t.ch === '\\begin' ? 'begin' : 'end'
      pendingAt = { line: t.line, col: t.col }
      continue
    }
    if (pending && !collecting) {
      if (t.ch === '{') { collecting = true; name = ''; continue }
      if (t.ch.trim() === '') continue
      pending = null // \begin not followed by a name; ignore
      continue
    }
    if (collecting) {
      if (t.ch !== '}') { name += t.ch; continue }
      collecting = false
      if (pending === 'begin') stack.push({ name, at: pendingAt! })
      else {
        const top = stack[stack.length - 1]
        if (!top) issues.push({ kind: 'unopened', name, at: pendingAt! })
        else if (top.name === name) stack.pop()
        else {
          issues.push({ kind: 'mismatch', name, at: pendingAt!, opened: top })
          // Assume the \end was a typo for the open environment and carry on.
          stack.pop()
        }
      }
      pending = null
    }
  }
  for (const s of stack) issues.push({ kind: 'unclosed', name: s.name, at: s.at })
  return issues
}

/**
 * Inline math (`$...$` or `\(...\)`) still open at the end of a paragraph.
 * Display math (`$$`, `\[`) is tracked so its dollars don't confuse the count.
 */
export function scanMath(text: string): SourcePos[] {
  const found: SourcePos[] = []
  let open: SourcePos | null = null
  let display = false
  let prevDollar: { line: number; col: number } | null = null
  for (const t of codeChars(text)) {
    if (t.ch === '\n') {
      if (t.lineStart && open && !display) {
        found.push(open)
        open = null
      }
      prevDollar = null
      continue
    }
    if (t.ch === '$') {
      // "$$" toggles display math.
      if (prevDollar && prevDollar.line === t.line && prevDollar.col === t.col - 1) {
        if (open && open.line === prevDollar.line && open.col === prevDollar.col) open = null
        display = !display
        prevDollar = null
        continue
      }
      prevDollar = { line: t.line, col: t.col }
      if (display) continue
      open = open ? null : { line: t.line, col: t.col }
      continue
    }
    prevDollar = null
    if (t.ch === '\\(') open = { line: t.line, col: t.col }
    else if (t.ch === '\\)') open = null
    else if (t.ch === '\\[') display = true
    else if (t.ch === '\\]') display = false
  }
  if (open && !display) found.push(open)
  return found
}
