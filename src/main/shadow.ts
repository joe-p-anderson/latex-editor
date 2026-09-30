// Preview builds compile unsaved editor buffers without writing them into
// the vault: each build copies the unsaved files into its own folder,
// <vault>/.texcache/.shadow/<n>/, at their vault-relative paths, and runs
// pdflatex from there. Everything else is found through TEXINPUTS, which
// lists the vault root after the shadow folder (see spikes/README.md).
//
// MiKTeX records the shadow copies by absolute path in the log and the
// .synctex.gz; unshadow() maps those paths back to the vault's own files.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const SHADOW = /([\\/])\.texcache[\\/]\.shadow[\\/]\d+(?=[\\/])/gi

/** `text` (a path, a log) with every shadow-folder path turned back into the vault path. */
export const unshadow = (text: string) => text.replace(SHADOW, '')

export const shadowRoot = (vaultRoot: string) => join(vaultRoot, '.texcache', '.shadow')

let counter = 0

/**
 * Writes `buffers` (vault-relative path → text) into a fresh shadow folder
 * and returns it. Older shadow folders are removed, except ones a build may
 * still be reading (they go on the next call).
 */
export async function writeShadow(vaultRoot: string, buffers: Record<string, string>): Promise<string> {
  const base = shadowRoot(vaultRoot)
  const n = `${Date.now()}${counter++ % 10}`
  const dir = join(base, n)
  await mkdir(dir, { recursive: true })
  for (const [rel, text] of Object.entries(buffers)) {
    const abs = join(dir, rel)
    if (!abs.startsWith(dir)) continue // never outside the shadow folder
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, text, 'utf8')
  }
  // Best effort: a folder pdflatex still has open is left for next time.
  for (const old of await readdir(base).catch(() => [] as string[])) {
    if (old !== n) rm(join(base, old), { recursive: true, force: true }).catch(() => {})
  }
  return dir
}
