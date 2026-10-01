// Multi-part papers: the files a document pulls in with \input and its
// relatives, found in the text alone. Pure, shared by the main process (the
// build's root and the paper graph) and the renderer (the paper map).

export type IncludeCommand = 'input' | 'include' | 'subfile' | 'import' | 'subimport'

/** One \input-like command in a file. */
export interface Include {
  cmd: IncludeCommand
  /** For \import and \subimport, the folder argument; '' otherwise. */
  dir: string
  /** The file argument as written. */
  arg: string
  /** 1-based line. */
  line: number
  /** Offsets of the whole command in the text (for a commented-out one, from its %). */
  from: number
  to: number
  /** Commented out (`% \input{x}`): not part of the build, but still part of the paper. */
  commented: boolean
}

// \input{x} or TeX's own \input x, \include{x}, \subfile{x},
// \import{dir}{x}, \subimport*{dir}{x} (and import's \inputfrom etc.).
const INCLUDE =
  /\\(input|include|subfile)(?![A-Za-z])(?:\s*\{([^{}]*)\}|[ \t]+([^\s{}\\%]+))|\\(sub)?(?:import|inputfrom|includefrom)(?![A-Za-z])\*?\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g

const INCLUDE_AT_START = new RegExp(`^(?:${INCLUDE.source})`)

/**
 * The include commands of `text`, in order. A line that's only a commented-out
 * include (`% \input{x}`, any number of %) counts, flagged `commented`; other
 * comments don't.
 */
export function parseIncludes(text: string): Include[] {
  const out: Include[] = []
  let offset = 0
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const cut = commentStart(line)
    const code = cut < 0 ? line : line.slice(0, cut)
    for (const m of code.matchAll(INCLUDE)) out.push(include(m, i + 1, offset + m.index!, false))
    // A line that is just a commented-out include: the paper map's "off" switch.
    const off = /^([ \t]*)(%+[ \t]*)(?=\\)/.exec(line)
    if (off && cut === off[1].length) {
      const m = INCLUDE_AT_START.exec(line.slice(off[0].length))
      if (m) {
        const inc = include(m, i + 1, offset + off[0].length, true)
        inc.from = offset + off[1].length
        out.push(inc)
      }
    }
    offset += raw.length + 1
  }
  return out
}

function include(m: RegExpExecArray | RegExpMatchArray, line: number, from: number, commented: boolean): Include {
  const to = from + m[0].length
  if (m[1]) return { cmd: m[1] as IncludeCommand, dir: '', arg: (m[2] ?? m[3] ?? '').trim(), line, from, to, commented }
  return { cmd: m[4] ? 'subimport' : 'import', dir: m[5].trim(), arg: m[6].trim(), line, from, to, commented }
}

/** Where a % comment starts on `line` (an unescaped %), or -1. */
export function commentStart(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') i++
    else if (line[i] === '%') return i
  }
  return -1
}

/** posix-style join and normalise of vault-relative parts; '' is the vault root. */
export function joinRel(...parts: string[]): string {
  const out: string[] = []
  for (const part of parts.join('/').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export const dirOf = (rel: string): string => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

/**
 * The paths `inc` (found in a file whose import base is `base`) could mean,
 * in the order TeX looks: from the import base, the root document's folder,
 * then the vault root, as the build's TEXINPUTS has them. With the folder
 * the included file's own \inputs resolve from.
 */
export function includeCandidates(inc: Include, rootDir: string, base: string): { candidates: string[]; base: string } {
  const withExt = (p: string) => (inc.cmd === 'include' || !/\.[A-Za-z0-9]+$/.test(p) ? `${p}.tex` : p)
  if (inc.cmd === 'import' || inc.cmd === 'subimport') {
    // \import's folder is from the document's; \subimport's from the importing file's.
    const dir = joinRel(inc.cmd === 'import' ? rootDir : base, inc.dir)
    return { candidates: [joinRel(dir, withExt(inc.arg))], base: dir }
  }
  const file = withExt(inc.arg)
  return { candidates: [...new Set([joinRel(base, file), joinRel(rootDir, file), joinRel(file)])], base }
}

/**
 * The vault-relative file `inc` refers to: the first candidate that exists,
 * or else the first (where it would go).
 */
export function resolveInclude(inc: Include, rootDir: string, base: string, exists: (rel: string) => boolean): { rel: string; base: string } {
  const { candidates, base: next } = includeCandidates(inc, rootDir, base)
  return { rel: candidates.find(exists) ?? candidates[0], base: next }
}

/** One file of a paper, in reading order. */
export interface PaperFile {
  rel: string
  /** The file that includes it; null for the root. */
  parent: string | null
  /** The include command in the parent (null for the root). */
  include: Include | null
  /** Nesting: 0 for the root, 1 for what it includes, and so on. */
  depth: number
  /** Left out of the build: its include, or one above it, is commented out. */
  off: boolean
  exists: boolean
}

/**
 * The files of the paper whose root is `root`, depth first in reading order,
 * root first. `read` gives a file's text (null when it can't be read).
 * A file included twice (or in a cycle) is listed once.
 */
export async function paperFiles(
  root: string,
  read: (rel: string) => Promise<string | null>,
  exists: (rel: string) => boolean | Promise<boolean>,
): Promise<{ files: PaperFile[]; texts: Map<string, string> }> {
  const rootDir = dirOf(root)
  const files: PaperFile[] = []
  const texts = new Map<string, string>()
  const seen = new Set<string>()
  const visit = async (rel: string, parent: string | null, inc: Include | null, depth: number, off: boolean, base: string) => {
    const key = rel.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const text = (await exists(rel)) ? await read(rel) : null
    files.push({ rel, parent, include: inc, depth, off, exists: text != null })
    if (text == null) return
    texts.set(rel, text)
    for (const child of parseIncludes(text)) {
      const { candidates, base: next } = includeCandidates(child, rootDir, base)
      let to = candidates[0]
      for (const c of candidates) {
        if (await exists(c)) {
          to = c
          break
        }
      }
      await visit(to, rel, child, depth + 1, off || child.commented, next)
    }
  }
  await visit(root, null, null, 0, false, rootDir)
  return { files, texts }
}

/** The `% !TEX root = …` line for a file `child` of the paper `root`. */
export function rootComment(child: string, root: string): string {
  const from = dirOf(child).split('/').filter(Boolean)
  const to = root.split('/')
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++
  return `% !TEX root = ${[...from.slice(common).map(() => '..'), ...to.slice(common)].join('/')}`
}

/** A `% !TEX root` magic comment's target, relative to the file `rel`, or null. */
export function magicRoot(rel: string, text: string): string | null {
  const m = /^%\s*!TEX root\s*=\s*(.+?)\s*$/im.exec(text)
  return m ? joinRel(dirOf(rel), m[1]) : null
}

/** Whether `text` is a document of its own (an uncommented \documentclass). */
export const isDocument = (text: string): boolean => /^[^%\n]*\\documentclass/m.test(text)
