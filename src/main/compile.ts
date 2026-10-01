// The compile pipeline proven in spikes/compile.ps1:
//   - pdflatex runs from the vault root, so Images/... resolves as before;
//   - classes come from the template libraries (the vault's, then the global one) via TEXINPUTS;
//   - aux, log, synctex and the working PDF live in .texcache/<reldir>/<name>/;
//   - a successful PDF is copied to pdf/<reldir>/<name>.pdf.
// Two speed-ups, proven in spikes/fastcompile.mjs:
//   - the preamble is compiled once into a format (preamble.ts);
//   - a preview build compiles unsaved buffers from a shadow folder
//     (shadow.ts), without touching the vault or pdf/.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { delimiter, isAbsolute, join, posix, resolve } from 'node:path'
import type { CompileResult, Problem } from '../shared/api'
import { bibKeys, bibNeeds, bibStale, dropBibKey, runBib, saveBibKey, type BibJob, type BibTool } from './bibliography'
import { diagnose, type DiagnoseContext } from './diagnose'
import { parseLog } from './logparser'
import { definitionsFor } from './macros'
import { buildFormat, dropFormat, preambleHash, preambleOf, usableFormat } from './preamble'
import { unshadow, writeShadow } from './shadow'
import type { Vault } from './vault'

const MAX_PASSES = 4
const PASS_TIMEOUT_MS = 120_000
const RERUN = /Rerun to get|Label\(s\) may have changed|Rerun LaTeX/
const CITES_CHANGED = /Rerun to get citations|Citation\(s\) may have changed/
// Any error line, in -file-line-error form (`path:12: ...`) or TeX's own (`! ...`).
const HAS_ERROR = /^(?:.+?\.[A-Za-z]{1,8}:\d+: |! )/m
const ERROR_LINES = /^(?:.+?\.[A-Za-z]{1,8}:\d+: |! )/gm

let running: ChildProcess | null = null
/** Bumped by every compile; an older compile stops once it sees a newer one. */
let generation = 0
let lastRoot: string | null = null

// Formats checked against a plain build after producing errors (see build),
// and formats found to change the result, by cache folder + preamble hash.
const checkedFormats = new Set<string>()
const badFormats = new Set<string>()

/**
 * Which document to compile when `rel` is saved. In order: a `% !TEX root`
 * magic comment, the file itself if it has a \documentclass, otherwise the
 * last document compiled (so saving an \input'ed piece rebuilds its parent).
 * `text` is the file's unsaved text, when there is some.
 */
export async function resolveRoot(vault: Vault, rel: string, text?: string): Promise<string | null> {
  if (!rel.endsWith('.tex')) return lastRoot
  text ??= await readFile(vault.abs(rel), 'utf8')
  const magic = /^%\s*!TEX root\s*=\s*(.+?)\s*$/im.exec(text)
  if (magic) return posix.normalize(posix.join(posix.dirname(rel), magic[1].replace(/\\/g, '/')))
  if (/^[^%\n]*\\documentclass/m.test(text)) return rel
  return lastRoot
}

/** Where a document's aux, log, synctex and working PDF live: .texcache/<reldir>/<name>/ */
export function cacheDirFor(vault: Vault, root: string): string {
  const relDir = posix.dirname(root) === '.' ? '' : posix.dirname(root)
  return join(vault.root, '.texcache', relDir, posix.basename(root, '.tex'))
}

/** Compiles the saved files and, if the build is clean, publishes the PDF to pdf/. */
export function compile(vault: Vault, rel: string): Promise<CompileResult> {
  return build(vault, rel, null)
}

/**
 * A preview build: compiles `buffers` (unsaved text by vault-relative path)
 * in place of the files on disk, which aren't touched. Nothing is copied
 * to pdf/. Null when `rel` doesn't lead to a document.
 */
export async function compileDraft(vault: Vault, rel: string, buffers: Record<string, string>): Promise<CompileResult | null> {
  const root = await resolveRoot(vault, rel, buffers[rel]).catch(() => null)
  if (!root) return null
  return build(vault, rel, buffers)
}

async function build(vault: Vault, rel: string, buffers: Record<string, string> | null): Promise<CompileResult> {
  const started = Date.now()
  const draft = !!buffers
  const root = await resolveRoot(vault, rel, buffers?.[rel])
  if (!root) {
    return {
      ok: false, root: rel, passes: 0, pdf: null, durationMs: 0, log: '', draft,
      problems: [{
        rule: 'not-a-document', severity: 'error', file: rel, line: null, fixes: [], tex: '',
        title: 'Nothing to compile',
        explanation: 'This file has no \\documentclass, and no document has been compiled yet to rebuild instead. Open and save the main document first.',
      }],
    }
  }
  lastRoot = root
  const gen = ++generation
  const stale = (): CompileResult => ({ ok: false, root, passes: 0, pdf: null, problems: [], log: '', durationMs: Date.now() - started, draft })

  const relDir = posix.dirname(root) === '.' ? '' : posix.dirname(root)
  const name = posix.basename(root, '.tex')
  const cacheDir = cacheDirFor(vault, root)
  const pdfDir = join(vault.root, 'pdf', relDir)
  await mkdir(cacheDir, { recursive: true })

  // A preview runs from a shadow folder holding the unsaved files; the
  // vault root comes next on the search path for everything else.
  const shadow = buffers && Object.keys(buffers).length ? await writeShadow(vault.root, buffers) : null
  if (gen !== generation) return stale()
  const cwd = shadow ?? vault.root
  const env = { ...process.env }
  // '//' searches subfolders; the trailing separator keeps MiKTeX's default path.
  const dirs = [...(shadow ? [shadow, vault.root] : []), ...vault.templateDirs.map((d) => `${d}//`)]
  if (dirs.length) env.TEXINPUTS = dirs.map((d) => `${d}${delimiter}`).join('')

  // The preamble format, when there is a current one. A preview whose
  // unsaved files include something the format was built from can't use it.
  const rootText = buffers?.[root] ?? (await readFile(vault.abs(root), 'utf8').catch(() => ''))
  const preamble = vault.fastCompile ? preambleOf(rootText) : null
  const formatKey = preamble && `${cacheDir}|${preambleHash(preamble)}`
  let format = preamble && !badFormats.has(formatKey!) ? await usableFormat(root, cacheDir, name, preamble, vault.root, [vault.root, ...vault.templateDirs]) : null
  if (format && buffers) {
    const dirty = new Set(Object.keys(buffers).map((r) => vault.abs(r).toLowerCase()))
    if (format.deps.some((d) => dirty.has(d.toLowerCase()))) format = null
  }

  const baseArgs = [
    '-synctex=1', '-interaction=nonstopmode', '-file-line-error',
    '-max-print-line=10000', // one message per line, no 79-column wrapping
    `-aux-directory=${cacheDir}`, `-output-directory=${cacheDir}`,
  ]
  const logPath = join(cacheDir, `${name}.log`)
  // The bibliography step runs (at most) once per build, after the first
  // pass that leaves an .aux asking for it.
  const bibJob: BibJob = { vault, root, cacheDir, name, shadow, buffers, started }
  let bibChecked = false
  let bibRan: BibTool | null = null
  let bibIssues: Problem[] = []
  const runPasses = async (fmt: string | null) => {
    const args = [...baseArgs, ...(fmt ? [`-fmt=${fmt}`] : []), root]
    let passes = 0
    let log = ''
    // Passes owed to a bibliography that just changed: its .bbl is read on
    // the next pass, and natbib numbers the citations on the one after.
    let owed = 0
    for (;;) {
      passes++
      await runTool('pdflatex', args, cwd, env)
      if (gen !== generation) return null
      log = await readFile(logPath, 'utf8').catch(() => '')
      if (!bibChecked) {
        bibChecked = true
        const needs = await bibNeeds(bibJob)
        if (needs && (await bibStale(bibJob, needs.key))) {
          bibIssues = await runBib(bibJob, needs, env, runTool)
          if (gen !== generation) return null
          bibRan = needs.tool
          // A failed run is tried again next build rather than trusted.
          if (bibIssues.some((p) => p.severity === 'error')) await dropBibKey(bibJob)
          else await saveBibKey(bibJob, needs.key)
          owed = 1
        }
      }
      // Rerunning can't fix an error, so only rerun a clean pass that asks
      // for it; citations are the exception, since they don't depend on it.
      const asks = RERUN.test(log) && (!HAS_ERROR.test(log) || (bibRan !== null && CITES_CHANGED.test(log)))
      if (owed > 0) owed--
      else if (!asks) break
      if (passes >= MAX_PASSES + (bibRan ? 2 : 0)) break
    }
    return { passes, log }
  }

  let run = await runPasses(format?.fmt ?? null)
  if (!run) return stale()
  // A format that leads to errors is checked once against a plain build.
  // If that build is cleaner, the format is at fault (some packages can't
  // be preloaded): it's dropped and never used for this preamble again.
  if (format && formatKey && HAS_ERROR.test(run.log) && !checkedFormats.has(formatKey)) {
    checkedFormats.add(formatKey)
    const plain = await runPasses(null)
    if (!plain) return stale()
    if (errorCount(plain.log) < errorCount(run.log)) {
      badFormats.add(formatKey)
      await dropFormat(cacheDir, name)
      run = { passes: run.passes + plain.passes, log: plain.log }
      format = null
    } else run = { passes: run.passes + plain.passes, log: plain.log }
  }

  let log = run.log
  if (shadow) {
    // Report the vault's files, not the shadow copies; and rewrite the log
    // on disk too, since the math preview reads it.
    log = unshadow(log)
    await writeFile(logPath, log).catch(() => {})
  }

  const overrides = buffers ? new Map(Object.entries(buffers).map(([r, t]) => [resolve(vault.abs(r)).toLowerCase(), t])) : undefined
  const problems = await diagnose(parseLog(log), diagnoseContext(vault, root, log, join(cacheDir, `${name}.aux`), overrides))
  problems.push(...bibIssues)
  const cachePdf = join(cacheDir, `${name}.pdf`)
  const pdfExists = await stat(cachePdf).then(() => true, () => false)
  const ok = pdfExists && !problems.some((p) => p.severity === 'error' && !p.hidden)
  if (ok && !draft) {
    await mkdir(pdfDir, { recursive: true })
    await copyFile(cachePdf, join(pdfDir, `${name}.pdf`))
  }

  // No format yet (or it's out of date): build one from the saved file in
  // the background, for the next compile. Only a clean saved build does
  // this, so a broken preamble isn't dumped.
  if (!format && !draft && ok && preamble && !badFormats.has(formatKey!)) {
    buildFormat(root, cacheDir, name, preamble, vault.root, env).catch(() => {})
  }

  return { ok, root, passes: run.passes, pdf: pdfExists ? cachePdf : null, problems, log, durationMs: Date.now() - started, draft, preloaded: !!format }
}

const errorCount = (log: string) => (log.match(ERROR_LINES) ?? []).length

/**
 * What the diagnosis rules may look at, read lazily and at most once.
 * `overrides` (absolute lower-cased path → text) are unsaved buffers,
 * read instead of the files on disk.
 */
export function diagnoseContext(vault: Vault, doc: string, log: string, auxPath: string, overrides?: Map<string, string>): DiagnoseContext {
  const once = <T>(f: () => Promise<T>) => {
    let p: Promise<T> | null = null
    return () => (p ??= f())
  }
  const texts = new Map<string, Promise<string | null>>()
  const read = (file: string) => {
    const abs = isAbsolute(file) ? file : vault.abs(file)
    const unsaved = overrides?.get(resolve(abs).toLowerCase())
    if (unsaved !== undefined) return Promise.resolve(unsaved)
    if (!texts.has(abs)) texts.set(abs, readFile(abs, 'utf8').catch(() => null))
    return texts.get(abs)!
  }
  return {
    root: vault.root,
    doc,
    read,
    files: once(() => vault.files()),
    // Labels from the .aux (what LaTeX actually recorded), else the source.
    labels: once(async () => {
      const aux = await readFile(auxPath, 'utf8').catch(() => null)
      const text = aux ?? (await read(doc)) ?? ''
      const re = aux ? /\\newlabel\{([^}]+)\}/g : /\\label\{([^}]+)\}/g
      return [...new Set([...text.matchAll(re)].map((m) => m[1]))]
    }),
    definitions: once(() => definitionsFor(log, vault.root)),
    citeKeys: once(() => bibKeys(vault, doc, overrides).catch(() => [])),
  }
}

/** Runs one pass of `cmd` (pdflatex, bibtex, biber), cancelling any still in flight from an earlier save. */
function runTool(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  running?.kill()
  return new Promise((resolvePass, reject) => {
    const child = spawn(cmd, args, { cwd, env, windowsHide: true })
    running = child
    const timer = setTimeout(() => child.kill(), PASS_TIMEOUT_MS)
    child.stdout.resume() // everything we need is in the .log; just drain the pipe
    child.stderr.resume()
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', () => {
      clearTimeout(timer)
      if (running === child) running = null
      resolvePass()
    })
  })
}
