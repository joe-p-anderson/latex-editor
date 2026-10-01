// A multi-part paper read as LaTeX reads it: one pass from the root through
// each \input in turn, so every file starts with the counters the one before
// it left (section III's file numbers from III, the appendix's equations are
// A1, A2, …), and labels are known across files. Pure; the renderer builds
// one from the paper's texts (open buffers taking precedence).
import { plain } from './latexedit'
import { freshCounters, headingNumbers, liveModel, type Counters, type LabelTarget, type LiveOptions, type NumberStyle } from './livemodel'
import type { PaperFile } from './project'

export interface PaperHeading {
  /** 0 chapter, 1 section, 2 subsection, 3 subsubsection. */
  level: number
  /** As its title shows it (III, A, Appendix A), or null when unnumbered. */
  number: string | null
  /** As a \ref prints it (II A), or null when unnumbered. */
  ref: string | null
  title: string
  /** 1-based. */
  line: number
}

export interface PaperFileModel {
  rel: string
  start: Counters
  end: Counters
  headings: PaperHeading[]
}

const LEVEL: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 }

export class PaperModel {
  readonly style: NumberStyle
  /** Each file reached (and not switched off), by path. */
  readonly files = new Map<string, PaperFileModel>()
  /** Every label in the paper, with its file and line. The first definition wins. */
  readonly labels = new Map<string, LabelTarget>()
  private readonly children = new Map<string, string>()
  private readonly ends = new Map<string, Counters>()

  /**
   * `files` is the paper's graph (root first), `text` each file's current
   * text with \n line breaks (null when unreadable).
   */
  constructor(
    readonly root: string,
    files: PaperFile[],
    private readonly text: (rel: string) => string | null,
    private readonly lists: Record<string, string>,
  ) {
    for (const f of files) {
      if (f.parent && f.include) this.children.set(childKey(f.parent, f.include), f.rel)
    }
    const rootText = text(root) ?? ''
    const first = liveModel(rootText, lists, { include: () => null })
    this.style = first.style
    this.walk(root, freshCounters(), new Set())
  }

  /** The file an include in `parent` brings in, or null when it isn't known. */
  childOf(parent: string, inc: { cmd: string; dir: string; arg: string }): string | null {
    return this.children.get(childKey(parent, inc)) ?? null
  }

  /**
   * The live model's options for `rel`: its starting counters, the paper's
   * style, the files it includes, and labels from the paper's other files.
   */
  options(rel: string): LiveOptions {
    return {
      start: this.files.get(rel)?.start,
      style: this.style,
      include: (inc, at) => {
        const child = this.childOf(rel, inc)
        return child ? this.endOf(child, at, new Set([rel])) : null
      },
      label: (key) => {
        const t = this.labels.get(key)
        return t && t.file !== rel ? t : null
      },
    }
  }

  /**
   * The section numbers a file holds, for the title bar: III, VI–VII, or the
   * section it's inside when it has no section of its own. Null when it has none.
   */
  sectionsOf(rel: string): string | null {
    const f = this.files.get(rel)
    if (!f) return null
    const top = f.start.hasChapters ? 0 : 1
    const own = f.headings.filter((h) => h.level === top && h.ref)
    if (own.length === 1) return own[0].ref
    if (own.length > 1) return `${own[0].ref}–${own[own.length - 1].ref}`
    // Inside a section begun in an earlier file.
    return f.start.sec[top] ? headingNumbers(f.start, top, this.style).ref : null
  }

  /** The counters after `rel`, starting from `start` (cached). */
  endOf(rel: string, start: Counters, stack: Set<string>): Counters | null {
    if (stack.has(rel)) return null
    const t = this.text(rel)
    if (t == null) return null
    const key = `${rel}|${JSON.stringify(start)}`
    const hit = this.ends.get(key)
    if (hit) return hit
    const inner = new Set(stack).add(rel)
    const m = liveModel(t, this.lists, {
      start,
      style: this.style,
      include: (inc, at) => {
        const child = this.childOf(rel, inc)
        return child ? this.endOf(child, at, inner) : null
      },
    })
    this.ends.set(key, m.end)
    return m.end
  }

  /** The reading pass: each file's start, headings and labels. */
  private walk(rel: string, start: Counters, stack: Set<string>): Counters | null {
    const t = this.text(rel)
    if (t == null || stack.has(rel)) return null
    const inner = new Set(stack).add(rel)
    const m = liveModel(t, this.lists, {
      start,
      style: this.style,
      include: (inc, at) => {
        const child = this.childOf(rel, inc)
        if (!child || this.files.has(child)) return null
        return this.walk(child, at, inner)
      },
    })
    const lineOf = lineIndex(t)
    const headings: PaperHeading[] = []
    for (const n of m.nodes) {
      if (n.kind !== 'heading') continue
      const kind = /^\\([a-z]+)/.exec(t.slice(n.from, n.from + 20))?.[1] ?? 'section'
      const title = n.openTo >= 0 ? plain(t.slice(n.openTo, n.closeFrom)) : ''
      headings.push({ level: LEVEL[kind] ?? 1, number: n.number, ref: n.ref, title: title || '(untitled)', line: lineOf(n.from) })
    }
    this.files.set(rel, { rel, start, end: m.end, headings })
    for (const [key, target] of m.labels) {
      if (!this.labels.has(key)) this.labels.set(key, { ...target, file: rel, line: lineOf(target.pos) })
    }
    return m.end
  }
}

const childKey = (parent: string, inc: { cmd: string; dir: string; arg: string }) => `${parent}|${inc.cmd}|${inc.dir}|${inc.arg}`

/** offset → 1-based line, for a text with \n breaks. */
function lineIndex(text: string): (offset: number) => number {
  const starts = [0]
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}
