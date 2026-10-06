// Pure helpers for vault-relative ("a/b/c.tex") paths, shared by the file tree
// and the main process.

export interface Move {
  from: string
  to: string
}

/** Whether `rel` is `dir` itself or lies somewhere under it. */
export function isInside(rel: string, dir: string): boolean {
  return dir === '' || rel === dir || rel.startsWith(dir + '/')
}

/** Where `rel` ends up after `moves`: file moves and folder-prefix moves. Null if it isn't affected. */
export function movedPath(rel: string, moves: Move[]): string | null {
  for (const m of moves) {
    if (rel === m.from) return m.to
    if (rel.startsWith(m.from + '/')) return m.to + rel.slice(m.from.length)
  }
  return null
}

export function dirname(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

export function basename(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1)
}

export function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

/** "a.tar.gz" → ["a.tar", ".gz"]; dotfiles and extension-less names keep an empty extension. */
export function splitExt(name: string): [string, string] {
  const i = name.lastIndexOf('.')
  return i <= 0 ? [name, ''] : [name.slice(0, i), name.slice(i)]
}

/** `name`, or "name (2).ext", "name (3).ext"… until `taken` doesn't hold it. */
export function uniqueName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name
  const [stem, ext] = splitExt(name)
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!taken(candidate)) return candidate
  }
}

/** Why `name` can't name a file or folder, or null if it can. */
export function badName(name: string): string | null {
  if (!name.trim()) return 'Enter a name'
  if (/[\\/:*?"<>|]/.test(name)) return 'A name can\'t contain \\ / : * ? " < > |'
  if (name === '.' || name === '..' || /[. ]$/.test(name)) return "A name can't end in a dot or space"
  return null
}

/** `rel` written relative to folder `fromDir` ("sec/a.tex" from "sec/sub" is "../a.tex"; from "" it is unchanged). */
export function relativeTo(fromDir: string, rel: string): string {
  const from = fromDir ? fromDir.split('/') : []
  const to = rel.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  return [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/')
}

const IMAGE = /\.(png|jpe?g|pdf|svg|gif|eps)$/i

/**
 * What dropping vault files `rels` into the open file inserts, one line per
 * file: \input for .tex, \includegraphics for images, the bibliography for
 * .bib, the bare path for anything else (and for every file in a non-.tex
 * document). Paths are relative to the open file's folder `dir`.
 */
export function dropText(rels: string[], dir: string, inTex: boolean, biblatex: boolean, graphic: (path: string) => string): string {
  return rels
    .map((rel) => {
      const path = relativeTo(dir, rel)
      if (!inTex) return path
      if (/\.tex$/i.test(rel)) return `\\input{${path.replace(/\.tex$/i, '')}}`
      if (/\.bib$/i.test(rel)) return biblatex ? `\\addbibresource{${path}}` : `\\bibliography{${path.replace(/\.bib$/i, '')}}`
      if (IMAGE.test(rel)) return graphic(path)
      return path
    })
    .join('\n')
}
