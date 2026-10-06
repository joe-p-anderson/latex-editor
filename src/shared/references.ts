// Finding the file references in a .tex file (\input, \includegraphics,
// \bibliography, \graphicspath …) and rewriting them after the files they
// name have moved. Pure: the caller says which paths exist.
import { basename, dirname, relativeTo, splitExt, type Move, movedPath } from './paths'
import { commentStart, joinRel } from './project'

export type RefKind = 'input' | 'graphic' | 'bib' | 'import' | 'graphicspath'

export interface Reference {
  kind: RefKind
  /** The argument as written. */
  arg: string
  /** 1-based line, and the argument's offsets in the text. */
  line: number
  from: number
  to: number
  /** The vault-relative file (or, for \graphicspath, folder) it points at. */
  target: string
  /** The folder the argument is relative to: the file's own folder or the vault root, or \import's folder. */
  base: string
  /** Whether `base` is the referencing file's own folder (so it moves with the file). */
  fileRelative: boolean
  /** The extensions the build adds to an argument that has none. */
  implied: string[]
}

export interface RefChange {
  line: number
  from: number
  to: number
  insert: string
  old: string
}

const EXTS = { input: ['.tex'], graphic: ['.pdf', '.png', '.jpg', '.jpeg'], bib: ['.bib'], import: ['.tex'], graphicspath: [] as string[] }

const PATTERNS: { kind: RefKind; re: RegExp }[] = [
  { kind: 'input', re: /\\(?:input|include|subfile)(?![A-Za-z])\s*\{([^{}]*)\}/g },
  { kind: 'graphic', re: /\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g },
  { kind: 'bib', re: /\\(?:bibliography|addbibresource)(?![A-Za-z])\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g },
  { kind: 'import', re: /\\(?:sub)?import\*?\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g },
  { kind: 'graphicspath', re: /\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)*)\}/g },
]

/**
 * The file references in `text`, which is the file at `fileRel`. Each is
 * resolved the way the build would: from the file's folder, then the vault
 * root, trying the implied extensions. References to things `exists` doesn't
 * know are left out.
 */
export function findReferences(text: string, fileRel: string, exists: (rel: string) => boolean): Reference[] {
  const out: Reference[] = []
  const fileDir = dirname(fileRel)
  let offset = 0
  text.split('\n').forEach((raw, i) => {
    const cut = commentStart(raw)
    const code = cut < 0 ? raw : raw.slice(0, cut)
    for (const { kind, re } of PATTERNS) {
      for (const m of code.matchAll(re)) {
        // [offset within the code line, the argument's text] for each piece of the command.
        const pieces: { at: number; arg: string; isBib?: boolean }[] = []
        if (kind === 'graphicspath') {
          const open = code.indexOf('{', m.index! + m[0].indexOf('graphicspath'))
          for (const d of m[1].matchAll(/\{([^{}]*)\}/g)) pieces.push({ at: open + 1 + d.index! + 1, arg: d[1] })
        } else if (kind === 'import') {
          const second = m[0].lastIndexOf('{')
          pieces.push({ at: m.index! + second + 1, arg: m[2] })
        } else {
          const open = m.index! + m[0].lastIndexOf('{')
          if (kind === 'bib' && /\\bibliography(?![A-Za-z])/.test(m[0])) {
            let pos = 0
            for (const part of m[1].split(',')) {
              const lead = part.length - part.trimStart().length
              if (part.trim()) pieces.push({ at: open + 1 + pos + lead, arg: part.trim() })
              pos += part.length + 1
            }
          } else pieces.push({ at: open + 1, arg: m[1].trim() || '' })
        }
        for (const p of pieces) {
          if (!p.arg || /[\\#]/.test(p.arg)) continue // empty, or built from macros
          const dirArg = kind === 'import' ? m[1].trim() : ''
          const bases = kind === 'import' ? [joinRel(fileDir, dirArg), joinRel(dirArg)] : [fileDir, '']
          const found = resolve(p.arg, bases, kind, exists)
          if (!found) continue
          const lead = raw.slice(p.at).length - raw.slice(p.at).trimStart().length
          out.push({
            kind,
            arg: p.arg,
            line: i + 1,
            from: offset + p.at + (kind === 'bib' ? 0 : lead),
            to: offset + p.at + (kind === 'bib' ? 0 : lead) + p.arg.length,
            target: found.target,
            base: found.base,
            fileRelative: found.base === fileDir && (kind !== 'import' || found.base === joinRel(fileDir, dirArg)),
            implied: EXTS[kind],
          })
        }
      }
    }
    offset += raw.length + 1
  })
  return out.sort((a, b) => a.from - b.from)
}

function resolve(arg: string, bases: string[], kind: RefKind, exists: (rel: string) => boolean): { target: string; base: string } | null {
  const bare = kind === 'graphicspath' ? arg.replace(/\/+$/, '') : arg
  for (const base of new Set(bases)) {
    for (const ext of ['', ...EXTS[kind]]) {
      const target = joinRel(base, bare + ext)
      if (target && exists(target)) return { target, base }
    }
  }
  return null
}

/**
 * The edits that point `refs` (found in the file that was at `fileRel`) at
 * where `moves` put their targets. Paths keep the way they were written:
 * relative to the file or to the vault root, and without the extension if
 * they had none. A moved file's own relative references are kept working too.
 */
export function retarget(refs: Reference[], moves: Move[], fileRel: string): RefChange[] {
  const newFile = movedPath(fileRel, moves) ?? fileRel
  const out: RefChange[] = []
  for (const r of refs) {
    const target = movedPath(r.target, moves) ?? r.target
    const base = r.kind === 'import' ? (movedPath(r.base, moves) ?? r.base) : r.fileRelative ? dirname(newFile) : r.base
    if (target === r.target && base === r.base) continue
    let path = relativeTo(base, target)
    if (r.kind === 'graphicspath') path += /\/$/.test(r.arg) ? '/' : ''
    else {
      // An argument written without an extension stays that way, if the new file's is the implied one.
      const ext = splitExt(basename(path))[1]
      if (!hadExtension(r) && r.implied.includes(ext.toLowerCase())) path = path.slice(0, path.length - ext.length)
    }
    if (/^\.\//.test(r.arg) && !path.startsWith('../') && !path.startsWith('./')) path = './' + path
    if (path !== r.arg) out.push({ line: r.line, from: r.from, to: r.to, insert: path, old: r.arg })
  }
  return out
}

/** Whether the argument spelled out its extension (an unknown one, like ".v2", doesn't count). */
function hadExtension(r: Reference): boolean {
  const ext = splitExt(basename(r.arg))[1].toLowerCase()
  return !!ext && (r.implied.includes(ext) || ext === splitExt(basename(r.target))[1].toLowerCase())
}
