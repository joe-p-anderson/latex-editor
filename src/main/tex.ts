// Finding TeX. Builds run pdflatex, bibtex and biber from PATH. An app
// started from the Start menu can have an out-of-date PATH (MiKTeX was
// installed after Explorer started), so MiKTeX's usual install folders are
// checked too, and a folder found there is added to this process's PATH,
// which every build inherits.
//
// Without TeX the app still opens and edits; startup offers a link to MiKTeX.

import { app, dialog, shell, type BrowserWindow } from 'electron'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

export const MIKTEX_URL = 'https://miktex.org/download'

const exe = process.platform === 'win32' ? 'pdflatex.exe' : 'pdflatex'
const exists = (p: string) => access(p).then(() => true, () => false)

/** MiKTeX's bin folders for a per-user and an all-users install. */
function miktexDirs(): string[] {
  const env = process.env
  const roots = [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']]
  return roots.filter((r): r is string => !!r).map((r) => join(r, 'MiKTeX', 'miktex', 'bin', 'x64'))
}

/** The folder pdflatex runs from, adding it to PATH if it wasn't there; null without TeX. */
export async function findTeX(): Promise<string | null> {
  const path = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of path) if (await exists(join(dir, exe))) return dir
  for (const dir of miktexDirs()) {
    if (!(await exists(join(dir, exe)))) continue
    process.env.PATH = [dir, ...path].join(delimiter)
    return dir
  }
  return null
}

/**
 * Checks for TeX, and when it's missing says so and offers MiKTeX's download
 * page, until it's found or the user carries on without it.
 */
export async function ensureTeX(win: BrowserWindow): Promise<boolean> {
  for (;;) {
    if (await findTeX()) return true
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: app.getName(),
      message: 'endleaf needs MiKTeX to build PDFs',
      detail:
        "pdflatex wasn't found. Install MiKTeX (free), then choose Check Again. " +
        'You can edit documents in the meantime, but they won’t compile.',
      buttons: ['Download MiKTeX', 'Check Again', 'Not Now'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    })
    if (response === 2) return false
    if (response === 0) await shell.openExternal(MIKTEX_URL)
  }
}
