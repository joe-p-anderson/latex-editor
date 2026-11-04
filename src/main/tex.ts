// Finding TeX. Builds run pdflatex, bibtex and biber from PATH. An app
// started from the Start menu can have an out-of-date PATH (TeX was
// installed after Explorer started), so MiKTeX's and TeX Live's usual
// install folders are checked too, and a folder found there is added to this
// process's PATH, which every build inherits.
//
// Without TeX the app still opens and edits; the renderer shows a card
// pointing to MiKTeX and TeX Live, and doesn't build.

import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import type { TexInfo } from '../shared/api'

const exe = process.platform === 'win32' ? 'pdflatex.exe' : 'pdflatex'

/** What detection looks at: the machine, so a test can fake it. */
export interface TexSystem {
  /** PATH's folders, in order. */
  path: string[]
  env: Partial<Record<'LOCALAPPDATA' | 'ProgramFiles' | 'ProgramFiles(x86)', string>>
  exists(path: string): Promise<boolean>
  /** A folder's entries' names; empty if it isn't there. */
  listDir(path: string): Promise<string[]>
  /** What `exe --version` prints, or null if it won't run. */
  version(exe: string): Promise<string | null>
}

/** The distribution and its version, from `pdflatex --version`'s first line. */
function identify(text: string | null): Pick<TexInfo, 'distribution' | 'version'> {
  const line = text?.split(/\r?\n/)[0] ?? ''
  const m = /\((MiKTeX|TeX Live) ([^)\s]+)/.exec(line)
  if (m) return { distribution: m[1], version: m[2] }
  return { distribution: 'TeX', version: /(\d[\d.-]*)/.exec(line)?.[1] ?? '' }
}

/**
 * Finds pdflatex: on PATH, then in MiKTeX's per-user and all-users bin
 * folders, then in TeX Live's (`C:\texlive\<year>\bin\windows`, newest year
 * first). Null if it's in none of them.
 */
export async function detectTeX(sys: TexSystem): Promise<TexInfo | null> {
  const found = async (bin: string, onPath: boolean): Promise<TexInfo | null> =>
    (await sys.exists(join(bin, exe))) ? { bin, ...identify(await sys.version(join(bin, exe))), onPath } : null
  for (const dir of sys.path) {
    const t = await found(dir, true)
    if (t) return t
  }
  for (const dir of await installFolders(sys)) {
    const t = await found(dir, false)
    if (t) return t
  }
  return null
}

const TEXLIVE_ROOT = 'C:\\texlive'

/** Where MiKTeX and TeX Live install themselves, in the order to look. */
async function installFolders(sys: TexSystem): Promise<string[]> {
  const { LOCALAPPDATA, ProgramFiles } = sys.env
  const miktex = [LOCALAPPDATA && join(LOCALAPPDATA, 'Programs'), ProgramFiles, sys.env['ProgramFiles(x86)']]
    .filter((r): r is string => !!r)
    .map((r) => join(r, 'MiKTeX', 'miktex', 'bin', 'x64'))
  const years = (await sys.listDir(TEXLIVE_ROOT)).filter((y) => /^\d{4}$/.test(y)).sort().reverse()
  return [...miktex, ...years.map((y) => join(TEXLIVE_ROOT, y, 'bin', 'windows'))]
}

const realSystem = (): TexSystem => ({
  path: (process.env.PATH ?? '').split(delimiter).filter(Boolean),
  env: process.env,
  exists: (p) => access(p).then(() => true, () => false),
  listDir: (p) => readdir(p).catch(() => []),
  version: (file) =>
    promisify(execFile)(file, ['--version'], { windowsHide: true, timeout: 15_000 }).then(
      (r) => r.stdout,
      () => null,
    ),
})

/**
 * Looks for TeX on this machine; a folder found off PATH is added to it, so
 * builds find it. Null without TeX.
 */
export async function findTeX(): Promise<TexInfo | null> {
  const sys = realSystem()
  const t = await detectTeX(sys)
  if (t && !t.onPath) process.env.PATH = [t.bin, ...sys.path].join(delimiter)
  return t
}
