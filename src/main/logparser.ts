// Structured reading of a pdfLaTeX log.
//
// Assumes the log was written with -file-line-error and -max-print-line=10000
// (see compile.ts), so every message sits on unwrapped lines. It finds:
//   - errors: `path:line: message` or `! message`, with TeX's context lines
//     (`l.12 text before|text after`) and help text;
//   - warnings: `LaTeX/Package X/Class X Warning: ...` plus continuation lines,
//     attributed to a file by following TeX's `(file ... )` nesting;
//   - bad boxes: `Overfull/Underfull \hbox ... at lines 3--4`.

export type LogLevel = 'error' | 'warning' | 'badbox'

export interface LogEntry {
  level: LogLevel
  /** File as written in the log: relative to the compile directory, or absolute. */
  file: string | null
  line: number | null
  /** The message, with continuation lines joined by spaces. */
  message: string
  /** For `Package foo Warning` / `Class bar Error`: foo / bar. */
  source?: string
  /** TeX's `l.N` context: the source text up to the error, and the rest of that line. */
  context?: { before: string; after: string }
  /** For "Runaway argument?": the start of the runaway text TeX printed. */
  runaway?: string
  /** Every log line belonging to this message, for showing TeX's own words. */
  raw: string[]
}

const ERROR_AT = /^(.+?\.[A-Za-z]{1,8}):(\d+): (.*)$/
const ERROR_BANG = /^! (.*)$/
const WARNING = /^(?:(LaTeX|pdfTeX|LaTeX Font)|(Package|Class|Module) (\S+)) Warning: (.*)$/
const BADBOX = /^(Over|Under)full \\[hv]box \((.*?)\) (?:in paragraph at lines (\d+)--(\d+)|in alignment at lines (\d+)--(\d+)|detected at line (\d+)|has occurred while \\output is active)/
const CONTEXT = /^l\.(\d+) (.*)$/
const JOB_ABORTED = /^\*\*\* \(job aborted/
// "(" immediately followed by something that looks like a file path.
const FILE_OPEN = /^\(((?:[A-Za-z]:)?[^\s(){}<>"]*\.[A-Za-z][A-Za-z0-9]{0,7})(?=[\s)]|$)/

export function parseLog(log: string): LogEntry[] {
  const lines = log.split(/\r?\n/)
  const entries: LogEntry[] = []
  const files: (string | null)[] = [] // TeX's open-file stack; null = a non-file "("
  const currentFile = () => {
    for (let i = files.length - 1; i >= 0; i--) if (files[i]) return files[i]
    return null
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // --- errors -----------------------------------------------------------
    let m: RegExpExecArray | null
    const at = ERROR_AT.exec(line)
    const bang = at ? null : ERROR_BANG.exec(line)
    if (at || bang) {
      const start = i
      const entry: LogEntry = {
        level: 'error',
        file: at ? at[1] : null,
        line: at ? Number(at[2]) : null,
        message: (at ? at[3] : bang![1]).trim(),
        raw: [],
      }
      // "Runaway argument?" and the runaway text come just before the error.
      if (i >= 2 && lines[i - 2] === 'Runaway argument?') {
        entry.runaway = lines[i - 1].replace(/\\ETC\.$/, '').trim()
        entry.raw.push(lines[i - 2], lines[i - 1])
      }
      i = readErrorBlock(lines, i, entry)
      entry.raw.push(...lines.slice(start, i))
      entries.push(entry)
      continue
    }

    if (JOB_ABORTED.test(line)) {
      entries.push({ level: 'error', file: null, line: null, message: line.trim(), raw: [line] })
      i++
      continue
    }

    // --- warnings ---------------------------------------------------------
    if ((m = WARNING.exec(line))) {
      const start = i
      const source = m[3]
      const parts = [m[4].trim()]
      i++
      // Continuations: "(pkgname)   more text" for packages, or indented /
      // non-blank lines for LaTeX's own multi-line warnings.
      while (i < lines.length && lines[i].trim() !== '' && isContinuation(lines[i], source)) {
        parts.push(lines[i].replace(/^\([^)]*\)\s*/, '').trim())
        i++
      }
      const message = parts.join(' ')
      const onLine = /on input line (\d+)/.exec(message)
      entries.push({
        level: 'warning',
        file: currentFile(),
        line: onLine ? Number(onLine[1]) : null,
        message,
        source: source ?? (m[1] === 'LaTeX Font' ? 'font' : undefined),
        raw: lines.slice(start, i),
      })
      continue
    }

    // --- bad boxes --------------------------------------------------------
    if ((m = BADBOX.exec(line))) {
      const start = i
      i++
      // The box's contents follow, up to a blank line.
      while (i < lines.length && lines[i].trim() !== '') i++
      const first = m[3] ?? m[5] ?? m[7]
      entries.push({
        level: 'badbox',
        file: currentFile(),
        line: first ? Number(first) : null,
        message: line.trim(),
        raw: lines.slice(start, i),
      })
      continue
    }

    // --- everything else: track which file TeX is reading -------------------
    trackFiles(line, files)
    i++
  }
  return attachLocations(entries)
}

function isContinuation(line: string, source: string | undefined): boolean {
  if (source) return line.startsWith(`(${source})`)
  return /^\s/.test(line) || line.startsWith('(Font)')
}

/**
 * Reads an error's context and help text. Returns the index after the block.
 * TeX prints, in some order: optional `<inserted text>`/`<*>`/`<read *>`
 * context pairs, the `l.N before` / `after` pair, then help text, ending at
 * a blank line. LaTeX errors put a blank line and "See the ... manual" first.
 */
function readErrorBlock(lines: string[], start: number, entry: LogEntry): number {
  let i = start + 1
  let sawContext = false
  const limit = Math.min(lines.length, start + 40)
  while (i < limit) {
    const l = lines[i]
    if (ERROR_AT.test(l) || ERROR_BANG.test(l) || JOB_ABORTED.test(l) || WARNING.test(l)) break
    const c = CONTEXT.exec(l)
    if (c) {
      sawContext = true
      entry.context = { before: c[2], after: (lines[i + 1] ?? '').trim() }
      entry.line ??= Number(c[1])
      i += 2
      continue
    }
    if (l.trim() === '') {
      // A blank line ends the block once the context line has been seen;
      // before that, it only separates a LaTeX error from its "See the..." text.
      if (sawContext) break
      const next = lines[i + 1] ?? ''
      if (!/^(See the|Type |Try typing|You're in trouble|Your command|I |This |The |You |Here is)/.test(next) && !/^[l<.]/.test(next)) {
        break
      }
    }
    i++
  }
  return i
}

/** Updates the open-file stack from the parentheses on one ordinary log line. */
function trackFiles(line: string, files: (string | null)[]): void {
  for (let j = 0; j < line.length; j++) {
    const ch = line[j]
    if (ch === '(') {
      const f = FILE_OPEN.exec(line.slice(j))
      if (f) {
        files.push(f[1])
        j += f[0].length - 1
      } else {
        files.push(null)
      }
    } else if (ch === ')') {
      files.pop()
    }
  }
}

/**
 * A `! LaTeX Error: File ... not found.` has no location of its own; TeX
 * gives it on the "Emergency stop" that follows. Copy it across.
 */
function attachLocations(entries: LogEntry[]): LogEntry[] {
  for (let k = 0; k < entries.length - 1; k++) {
    const e = entries[k]
    const next = entries[k + 1]
    if (e.level === 'error' && e.line == null && next.level === 'error' && /Emergency stop/.test(next.message)) {
      e.file = next.file
      e.line = next.line
      e.context ??= next.context
    }
  }
  return entries
}
