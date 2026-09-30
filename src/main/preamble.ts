// Preamble caching: the document's preamble (the class, the packages, the
// macros) is compiled once into a format file with mylatexformat, and each
// build starts from it instead of loading everything again. Measured in
// spikes/fastcompile.mjs: a pass drops from ~1.8 s to ~1.0 s.
//
// Files in the document's cache folder:
//   <name>-preamble.fmt   the format
//   <name>-preamble.fls   what building it read (-recorder), to notice when
//                         a class or package in the vault or a template
//                         library changes
//   <name>-preamble.key   hash of the preamble text it was built from
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

const BUILD_TIMEOUT_MS = 120_000

/** The text before \begin{document}, or null when there is none (not a document, or it's commented out). */
export function preambleOf(text: string): string | null {
  const m = /^[^%\n]*?\\begin\s*\{document\}/m.exec(text)
  return m ? text.slice(0, m.index + m[0].length).replace(/\r\n/g, '\n') : null
}

export const preambleHash = (preamble: string) => createHash('sha1').update(preamble).digest('hex')

/** Files a format depends on that might change: those under `roots` (the vault, the template libraries). */
export function formatDeps(fls: string, cwd: string, roots: string[]): string[] {
  const inside = (abs: string) =>
    roots.some((r) => {
      const rel = relative(r, abs)
      return !rel.startsWith('..') && !isAbsolute(rel)
    })
  const out = new Set<string>()
  for (const line of fls.split(/\r?\n/)) {
    if (!line.startsWith('INPUT ')) continue
    const abs = resolve(cwd, line.slice(6).trim())
    if (/[\\/]\.texcache[\\/]/.test(abs) || /\.(fmt|aux)$/i.test(abs)) continue
    if (inside(abs)) out.add(abs)
  }
  return [...out]
}

export interface FormatInfo {
  /** Absolute path without the .fmt extension, as -fmt wants it. */
  fmt: string
  /** The files it was built from (absolute), for telling whether a buffer is one of them. */
  deps: string[]
}

/**
 * The document's format, if it exists and still matches `preamble` and
 * the files it was built from. Null means build without one.
 */
export async function usableFormat(root: string, cacheDir: string, name: string, preamble: string, cwd: string, roots: string[]): Promise<FormatInfo | null> {
  const base = join(cacheDir, `${name}-preamble`)
  const [key, fls, fmtStat] = await Promise.all([
    readFile(`${base}.key`, 'utf8').catch(() => null),
    readFile(`${base}.fls`, 'utf8').catch(() => null),
    stat(`${base}.fmt`).catch(() => null),
  ])
  if (!key || fls == null || !fmtStat || key.trim() !== preambleHash(preamble)) return null
  // The document itself is always read; its preamble is covered by the key.
  const self = resolve(cwd, root)
  const deps = formatDeps(fls, cwd, roots).filter((d) => d.toLowerCase() !== self.toLowerCase())
  for (const d of deps) {
    const s = await stat(d).catch(() => null)
    if (!s || s.mtimeMs > fmtStat.mtimeMs) return null
  }
  return { fmt: base, deps }
}

// One format build at a time per document.
const building = new Map<string, Promise<boolean>>()

/**
 * Builds the document's format from the saved file on disk, in the
 * background. Written under a temporary name and renamed at the end, so
 * a compile never picks up a half-written format.
 */
export function buildFormat(root: string, cacheDir: string, name: string, preamble: string, cwd: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const running = building.get(cacheDir)
  if (running) return running
  const job = `${name}-preamble-new`
  const base = join(cacheDir, `${name}-preamble`)
  const task = new Promise<boolean>((done) => {
    // mylatexformat reads the file name as TeX input, where a space ends it
    // unless the name is quoted ("Lecture handouts/x.tex").
    const file = /\s/.test(root) ? `"${root}"` : root
    const args = ['-ini', '-interaction=nonstopmode', '-recorder', `-jobname=${job}`, `-output-directory=${cacheDir}`, '&pdflatex', 'mylatexformat.ltx', file]
    const child = spawn('pdflatex', args, { cwd, env, windowsHide: true })
    const timer = setTimeout(() => child.kill(), BUILD_TIMEOUT_MS)
    child.stdout.resume()
    child.stderr.resume()
    child.on('error', () => (clearTimeout(timer), done(false)))
    child.on('close', (code) => (clearTimeout(timer), done(code === 0)))
  }).then(async (ok) => {
    const tmp = join(cacheDir, job)
    if (ok && (await stat(`${tmp}.fmt`).catch(() => null))) {
      await rename(`${tmp}.fmt`, `${base}.fmt`)
      await rename(`${tmp}.fls`, `${base}.fls`).catch(() => writeFile(`${base}.fls`, ''))
      await writeFile(`${base}.key`, preambleHash(preamble))
    } else ok = false
    for (const ext of ['fmt', 'fls', 'log']) await rm(`${tmp}.${ext}`, { force: true }).catch(() => {})
    return ok
  })
  building.set(cacheDir, task)
  task.finally(() => building.delete(cacheDir))
  return task
}

/** Resolves when every format build in progress has finished (for tests). */
export async function formatsBuilt(): Promise<void> {
  await Promise.all(building.values())
}

/** Removes the document's format (it produced a different result from a plain build). */
export async function dropFormat(cacheDir: string, name: string): Promise<void> {
  for (const ext of ['fmt', 'fls', 'key']) await rm(join(cacheDir, `${name}-preamble.${ext}`), { force: true }).catch(() => {})
}
