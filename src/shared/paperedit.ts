// The paper map's edits, worked out on text alone: switching an \input off
// and on, moving one among its siblings, a new section file, moving a
// section into a file of its own and back, and renumbering 1_, 2_ file
// names to match the order. Pure; the renderer applies the changes (to an
// open file through its editor, so they can be undone). Texts have \n breaks.
import { dirOf, joinRel, type Include } from './project'

export interface Change {
  from: number
  to: number
  insert: string
}

const lineStartAt = (text: string, pos: number) => text.lastIndexOf('\n', pos - 1) + 1
const lineEndAt = (text: string, pos: number) => {
  const nl = text.indexOf('\n', pos)
  return nl < 0 ? text.length : nl
}

/**
 * The lines an include occupies, with the comment lines directly above it
 * (a note about that section travels with it). `to` is past its line break.
 */
export function includeBlock(text: string, inc: Include): { from: number; to: number } {
  let from = lineStartAt(text, inc.from)
  for (;;) {
    if (from === 0) break
    const prev = lineStartAt(text, from - 1)
    const line = text.slice(prev, from - 1)
    // A plain comment line, not itself a switched-off include.
    if (!/^\s*%/.test(line) || /^\s*%+\s*\\(input|include|subfile|import|subimport)(?![A-Za-z])/.test(line)) break
    from = prev
  }
  const end = lineEndAt(text, inc.to)
  return { from, to: end < text.length ? end + 1 : end }
}

/** Switches an include off (comments it out) or back on. */
export function toggleInclude(text: string, inc: Include): Change[] {
  if (inc.commented) {
    // Drop the %s (and the space after them) in front of the command.
    const m = /^%+[ \t]*/.exec(text.slice(inc.from))
    return m ? [{ from: inc.from, to: inc.from + m[0].length, insert: '' }] : []
  }
  const start = lineStartAt(text, inc.from)
  // Alone on its line: comment the line; otherwise just the command onwards.
  const at = text.slice(start, inc.from).trim() ? inc.from : start
  return [{ from: at, to: at, insert: '% ' }]
}

/**
 * Moves the include `moving` (with its comment lines) to just before or
 * after `target`'s block. Both are includes of the same text.
 */
export function moveInclude(text: string, moving: Include, target: Include, place: 'before' | 'after'): Change[] {
  const a = includeBlock(text, moving)
  const b = includeBlock(text, target)
  if (a.from === b.from) return []
  let block = text.slice(a.from, a.to)
  if (!block.endsWith('\n')) block += '\n'
  let at = place === 'before' ? b.from : b.to
  // The target is the file's last line, with no break after it.
  let lead = ''
  if (place === 'after' && b.to === text.length && !text.endsWith('\n')) lead = '\n'
  if (at > a.from && at <= a.to) return [] // onto itself
  const without = text.slice(0, a.from) + text.slice(a.to)
  if (at > a.from) at -= a.to - a.from
  let out = without.slice(0, at) + lead + block + without.slice(at)
  if (lead) out = out.replace(/\n$/, '')
  // One change over the whole stretch both blocks cover.
  const from = Math.min(a.from, b.from)
  const to = Math.max(a.to, b.to)
  const newTo = to + (out.length - text.length)
  return [{ from, to, insert: out.slice(from, newTo) }]
}

/** A file name from a section title: "Reduced model (2D)" → reduced_model_2d. */
export function slugify(title: string): string {
  const s = title
    .replace(/\\[A-Za-z@]+\*?/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (s.split('_').slice(0, 5).join('_') || 'section').slice(0, 40)
}

/**
 * Where a new section file of the paper goes, and how its \input names it:
 * in the folder its siblings share (else the root's), written as they are
 * (with or without .tex, relative to the root's folder).
 */
export function placeNewFile(base: string, root: string, siblings: { rel: string; arg: string }[], taken: (rel: string) => boolean): { rel: string; arg: string } {
  const rootDir = dirOf(root)
  const dirs = siblings.map((s) => dirOf(s.rel))
  const dir = dirs.length && dirs.every((d) => d === dirs[0]) ? dirs[0] : rootDir
  const withExt = siblings.some((s) => /\.tex$/i.test(s.arg))
  let rel = joinRel(dir, `${base}.tex`)
  for (let n = 2; taken(rel); n++) rel = joinRel(dir, `${base}_${n}.tex`)
  const fromRoot = rootDir && rel.startsWith(`${rootDir}/`) ? rel.slice(rootDir.length + 1) : rel
  return { rel, arg: withExt ? fromRoot : fromRoot.replace(/\.tex$/i, '') }
}

const HEADING = /^[ \t]*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?(?![A-Za-z])/
const LEVEL: Record<string, number> = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 }
// Where a section's text stops even without another heading.
const STOP = /^[ \t]*\\(appendix|bibliography|bibliographystyle|printbibliography|end\s*\{document\}|input|include|subfile|import|subimport)(?![A-Za-z])/

/**
 * The text of the section whose heading is on `line` (1-based): from that
 * line to the next heading at its level or above (or the appendix, the
 * bibliography, an include, the end of the document). Null when there's no
 * heading there.
 */
export function sectionSpan(text: string, line: number): { from: number; to: number; level: number } | null {
  const lines = text.split('\n')
  const m = HEADING.exec(lines[line - 1] ?? '')
  if (!m) return null // (a commented-out heading starts with %, so it doesn't match)
  const level = LEVEL[m[1]]
  let end = lines.length
  for (let i = line; i < lines.length; i++) {
    const h = HEADING.exec(lines[i])
    if ((h && LEVEL[h[1]] <= level) || STOP.test(lines[i])) {
      end = i
      break
    }
  }
  // Blank lines at the end stay where they are.
  while (end > line && !lines[end - 1].trim()) end--
  const from = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
  const to = lines.slice(0, end).reduce((n, l) => n + l.length + 1, 0)
  return { from, to: Math.min(to, text.length), level }
}

/**
 * Moves the section on `line` into a file of its own: the parent's text
 * loses it for `\input{arg}`, and `body` is the new file's text (after
 * `header`, e.g. its % !TEX root line).
 */
export function extractSection(text: string, line: number, cmd: string, arg: string, header: string): { changes: Change[]; body: string } | null {
  const span = sectionSpan(text, line)
  if (!span) return null
  let section = text.slice(span.from, span.to)
  if (!section.endsWith('\n')) section += '\n'
  const replace = `\\${cmd}{${arg}}${span.to >= text.length && !text.endsWith('\n') ? '' : '\n'}`
  return { changes: [{ from: span.from, to: span.to, insert: replace }], body: `${header}${section}` }
}

/** The nearest section heading at or above `line` (1-based), with its title. */
export function headingAt(text: string, line: number): { line: number; title: string } | null {
  const lines = text.split('\n')
  for (let i = Math.min(line, lines.length); i >= 1; i--) {
    if (!HEADING.test(lines[i - 1])) continue
    const m = /^[ \t]*\\[a-z]+\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(lines[i - 1])
    return { line: i, title: m ? m[1].replace(/\\[a-zA-Z]+\s*|[{}]/g, '').trim() : '' }
  }
  return null
}

/**
 * Moves exactly the text from `from` to `to` into a file of its own, leaving
 * `\cmd{arg}` on a line of its own in its place (the lines around it stay
 * apart). `body` is the new file's text, after `header`.
 */
export function extractRange(text: string, from: number, to: number, cmd: string, arg: string, header: string): { changes: Change[]; body: string } | null {
  if (to <= from || !text.slice(from, to).trim()) return null
  let part = text.slice(from, to)
  const before = from > 0 && text[from - 1] !== '\n' ? '\n' : ''
  const after = part.endsWith('\n') || (to < text.length && text[to] !== '\n') ? '\n' : ''
  if (!part.endsWith('\n')) part += '\n'
  return { changes: [{ from, to, insert: `${before}\\${cmd}{${arg}}${after}` }], body: `${header}${part}` }
}

/**
 * Puts a file's text back in place of the include that brings it in (the
 * reverse of extractSection). Its own % !TEX root line is left out.
 */
export function inlineInclude(text: string, inc: Include, child: string): Change[] {
  const from = lineStartAt(text, inc.from)
  const end = lineEndAt(text, inc.to)
  // Only the include on its line: the whole line goes; otherwise just the command.
  const alone = !text.slice(from, inc.from).trim() && !text.slice(inc.to, end).trim()
  let body = child.replace(/^%\s*!TEX root[^\n]*\n?/im, '').replace(/\n+$/, '')
  if (!alone) return [{ from: inc.from, to: inc.to, insert: body }]
  if (end < text.length) body += '\n'
  return [{ from, to: end < text.length ? end + 1 : end, insert: body }]
}

const PREFIX = /^(\d+)([_-])/

/**
 * Renames that make number-prefixed file names (1_Intro, 2_Methods) follow
 * the paper's order again, when they don't: after a reorder, or a new file
 * among them. `files` are siblings in reading order. Empty when they're in
 * order already, or fewer than two are numbered.
 */
export function renumberPlan(files: string[]): { from: string; to: string }[] {
  const base = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)
  const numbered = files.map((f) => PREFIX.exec(base(f)))
  const idx = numbered.flatMap((m, i) => (m ? [i] : []))
  if (idx.length < 2) return []
  const first = idx[0]
  const last = idx[idx.length - 1]
  // The numbered run, and any file without a number inside it (a new one).
  const run = files.slice(first, last + 1)
  const nums = idx.map((i) => Number(numbered[i]![1]))
  const inOrder = nums.every((n, k) => k === 0 || n > nums[k - 1])
  const gaps = run.some((f) => !PREFIX.test(base(f)))
  if (inOrder && !gaps) return []
  const width = Math.max(...idx.map((i) => (numbered[i]![1].startsWith('0') ? numbered[i]![1].length : 1)))
  const sep = numbered[first]![2]
  // Only reordered: the same numbers, handed out again in the new order (so
  // 67_discussion stays 67). With a new file among them: it takes the next
  // number, and the files after it move up only as far as they must.
  const sorted = [...nums].sort((x, y) => x - y)
  let prev = 0
  const numbers = run.map((f, k) => {
    if (!gaps) return sorted[k]
    const own = PREFIX.exec(base(f))
    prev = own && Number(own[1]) > prev ? Number(own[1]) : prev + 1
    return prev
  })
  const out: { from: string; to: string }[] = []
  run.forEach((f, k) => {
    const b = base(f)
    const n = String(numbers[k]).padStart(width, '0')
    const rest = b.replace(PREFIX, '')
    const to = f.slice(0, f.length - b.length) + `${n}${PREFIX.exec(b)?.[2] ?? sep}${rest}`
    if (to !== f) out.push({ from: f, to })
  })
  return out
}

/**
 * The includes of `text` whose files were renamed, pointed at their new
 * names. `target` gives the file an include refers to.
 */
export function renameIncludes(text: string, incs: Include[], target: (inc: Include) => string | null, renames: Map<string, string>): Change[] {
  const out: Change[] = []
  for (const inc of incs) {
    const rel = target(inc)
    const to = rel && renames.get(rel)
    if (!rel || !to) continue
    const oldName = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.tex$/i, '')
    const newName = to.slice(to.lastIndexOf('/') + 1).replace(/\.tex$/i, '')
    const seg = text.slice(inc.from, inc.to)
    // The file argument is the last {…} of the command.
    const open = seg.lastIndexOf('{')
    const close = seg.lastIndexOf('}')
    if (open < 0 || close < open) continue
    const arg = seg.slice(open + 1, close)
    const at = arg.lastIndexOf(oldName)
    if (at < 0) continue
    const next = arg.slice(0, at) + newName + arg.slice(at + oldName.length)
    out.push({ from: inc.from + open + 1, to: inc.from + close, insert: next })
  }
  return out
}
