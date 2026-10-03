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
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, isAbsolute, join, posix, resolve } from 'node:path'
import type { CompileResult, Problem } from '../shared/api'
import { bibKeys, bibNeeds, bibStale, dropBibKey, runBib, saveBibKey, type BibJob, type BibTool } from './bibliography'
import { diagnose, type DiagnoseContext } from './diagnose'
import { parseLog } from './logparser'
import { definitionsFor } from './macros'
import { buildFormat, dropFormat, preambleHash, preambleOf, usableFormat } from './preamble'
import { declaredPaperOf, paperGraph } from './project'
import { dirOf, isDocument, magicRoot, type PaperFile } from '../shared/project'
import { labelsIn, sectionDocument } from '../shared/sectiondoc'
import { citedKeys } from '../shared/bibtex'
import type { Counters } from '../shared/livemodel'
import { unshadow, writeShadow } from './shadow'
import { runAfterBuild, runBeforeBuild, type BuildKind } from './buildhooks'
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
 * magic comment, the file itself if it has a \documentclass, a paper marked
 * in .vault.json that includes it, otherwise the last document compiled (so
 * saving an \input'ed piece rebuilds its parent). `text` is the file's
 * unsaved text, when there is some.
 */
export async function resolveRoot(vault: Vault, rel: string, text?: string): Promise<string | null> {
  if (!rel.endsWith('.tex')) return lastRoot
  text ??= await readFile(vault.abs(rel), 'utf8')
  const magic = magicRoot(rel, text)
  if (magic) return magic
  if (isDocument(text)) return rel
  return (await declaredPaperOf(vault, rel)) ?? lastRoot
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
  const kind: BuildKind = draft ? 'draft' : 'full'
  await runBeforeBuild({ kind, vault, root, cacheDir, name, buffers })
  if (gen !== generation) return stale()
  const shadow = buffers && Object.keys(buffers).length ? await writeShadow(vault.root, buffers) : null
  if (gen !== generation) return stale()
  const cwd = shadow ?? vault.root
  const env = texEnv(vault, relDir, shadow)
  // \include{sections/x} writes sections/x.aux in the aux folder, which must exist.
  const { files: parts } = await paperGraph(vault, root, buffers ?? undefined).catch(() => ({ files: [] }))
  for (const f of parts) {
    if (f.include?.cmd === 'include' && /[\\/]/.test(f.include.arg)) {
      await mkdir(join(cacheDir, dirOf(f.include.arg.replace(/\\/g, '/'))), { recursive: true }).catch(() => {})
    }
  }

  // The preamble format, when there is a current one. A preview whose
  // unsaved files include something the format was built from can't use it.
  const rootText = buffers?.[root] ?? (await readFile(vault.abs(root), 'utf8').catch(() => ''))
  const preamble = vault.fastCompile ? preambleOf(rootText) : null
  const formatKey = preamble && `${cacheDir}|${preambleHash(preamble)}`
  let format = await formatFor(vault, root, cacheDir, name, preamble, buffers)

  const baseArgs = baseArgsFor(cacheDir)
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
      // A pass that dies before writing its log must not be read as the last pass's.
      await rm(logPath, { force: true }).catch(() => {})
      await runTool('pdflatex', args, cwd, env)
      if (gen !== generation) return null
      log = await readFile(logPath, 'utf8').catch(() => '')
      if (!log) break // pdflatex didn't run (see the format check below)
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
  // pdflatex can die loading a format before writing anything (MiKTeX does
  // when the format's path is very long): build without it, and don't use it again.
  if (format && formatKey && !run.log) {
    badFormats.add(formatKey)
    await dropFormat(cacheDir, name)
    format = null
    run = await runPasses(null)
    if (!run) return stale()
  }
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

  const result: CompileResult = { ok, root, passes: run.passes, pdf: pdfExists ? cachePdf : null, problems, log, durationMs: Date.now() - started, draft, preloaded: !!format }
  await runAfterBuild({ kind, vault, root, cacheDir, name, buffers, auxPath: join(cacheDir, `${name}.aux`), result })
  return result
}

const errorCount = (log: string) => (log.match(ERROR_LINES) ?? []).length

/**
 * pdflatex's environment: TEXINPUTS with the shadow folder (for a preview),
 * the document's own folder, the vault root and the template libraries.
 */
function texEnv(vault: Vault, relDir: string, shadow: string | null): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // '//' searches subfolders; the trailing separator keeps MiKTeX's default path.
  // A document in a subfolder finds its \input pieces in its own folder
  // (and the shadow's copy of it) before the vault root.
  const docDirs = relDir ? [...(shadow ? [join(shadow, relDir)] : []), join(vault.root, relDir)] : []
  const dirs = [...(shadow ? [shadow] : []), ...docDirs, ...(shadow || relDir ? [vault.root] : []), ...vault.templateDirs.map((d) => `${d}//`)]
  if (dirs.length) env.TEXINPUTS = dirs.map((d) => `${d}${delimiter}`).join('')
  return env
}

/**
 * The preamble format, when there is a current one. A preview whose unsaved
 * files include something the format was built from can't use it.
 */
async function formatFor(vault: Vault, root: string, cacheDir: string, name: string, preamble: string | null, buffers: Record<string, string> | null) {
  const formatKey = preamble && `${cacheDir}|${preambleHash(preamble)}`
  const format = preamble && !badFormats.has(formatKey!) ? await usableFormat(root, cacheDir, name, preamble, vault.root, [vault.root, ...vault.templateDirs]) : null
  if (format && buffers) {
    const dirty = new Set(Object.keys(buffers).map((r) => vault.abs(r).toLowerCase()))
    if (format.deps.some((d) => dirty.has(d.toLowerCase()))) return null
  }
  return format
}

const baseArgsFor = (cacheDir: string) => [
  '-synctex=1', '-interaction=nonstopmode', '-file-line-error',
  '-max-print-line=10000', // one message per line, no 79-column wrapping
  `-aux-directory=${cacheDir}`, `-output-directory=${cacheDir}`,
]

/** The full build's .aux for `root`, which a section build reads its labels and citations from. */
const fullAux = (vault: Vault, root: string) => join(cacheDirFor(vault, root), `${posix.basename(root, '.tex')}.aux`)

/**
 * Why saving `rel` (with text `text`) should build the whole paper rather
 * than just its section, or null when its section will do: there's no full
 * build yet; another of the paper's files was saved since the last one (its
 * numbers or labels may have moved); or `rel` defines a label or cites a key
 * the last full build didn't see.
 */
export async function fullBuildReason(vault: Vault, root: string, rel: string, text: string): Promise<string | null> {
  const auxPath = fullAux(vault, root)
  const built = await stat(auxPath).then((s) => s.mtimeMs, () => null)
  if (built == null) return 'The paper hasn\'t been built in full yet'
  const { files } = await paperGraph(vault, root).catch(() => ({ files: [] as { rel: string; exists: boolean; off: boolean }[] }))
  for (const f of files) {
    if (f.rel === rel || !f.exists || f.off) continue
    const changed = await stat(vault.abs(f.rel)).then((s) => s.mtimeMs > built, () => false)
    if (changed) return `${posix.basename(f.rel)} changed since the last full build`
  }
  const aux = await readFile(auxPath, 'utf8').catch(() => '')
  const known = new Set([...aux.matchAll(/\\newlabel\{([^}]+)\}/g)].map((m) => m[1]))
  const fresh = labelsIn(text).find((k) => !known.has(k))
  if (fresh) return `New label ${fresh}`
  const cited = new Set([...aux.matchAll(/\\citation\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((k) => k.trim())))
  const newCite = citedKeys(text).find((k) => !cited.has(k))
  if (newCite) return `New citation ${newCite}`
  return null
}

/**
 * Builds just one file of a marked paper (`unit`, which the root \inputs),
 * as a preview: the root's preamble, the counters where that file starts
 * (`start`, from the renderer's paper model), and the labels and citations
 * of the last full build, in one pass (see sectiondoc.ts). `label` names it
 * (§III). Null when it can't be done: no full build to read labels from, or
 * `unit` isn't one of the root's own includes.
 */
export async function compileSection(
  vault: Vault,
  rel: string,
  buffers: Record<string, string>,
  unit: string,
  start: Counters,
  label: string,
): Promise<CompileResult | null> {
  const started = Date.now()
  const root = await resolveRoot(vault, rel, buffers[rel]).catch(() => null)
  if (!root) return null
  const relDir = posix.dirname(root) === '.' ? '' : posix.dirname(root)
  const name = posix.basename(root, '.tex')
  const cacheDir = cacheDirFor(vault, root)
  if (!(await stat(fullAux(vault, root)).then(() => true, () => false))) return null
  const { files } = await paperGraph(vault, root, buffers).catch(() => ({ files: [] as PaperFile[] }))
  const file = files.find((f) => f.rel === unit && f.parent === root && !f.off && f.include)
  const rootText = buffers[root] ?? (await readFile(vault.abs(root), 'utf8').catch(() => ''))
  const doc = file ? sectionDocument(rootText, file.include!.line, start) : null
  if (!doc) return null

  lastRoot = root
  const gen = ++generation
  const draft = true
  const stale = (): CompileResult => ({ ok: false, root, passes: 0, pdf: null, problems: [], log: '', durationMs: Date.now() - started, draft, section: label })
  await runBeforeBuild({ kind: 'section', vault, root, cacheDir, name, buffers })
  if (gen !== generation) return stale()
  const shadow = Object.keys(buffers).length ? await writeShadow(vault.root, buffers) : null
  if (gen !== generation) return stale()

  // Its own job in the cache folder, starting from the full build's .aux
  // (labels, \bibcite) and .bbl (biblatex).
  const job = `${name}-section`
  const docPath = join(cacheDir, `${job}.tex`)
  await writeFile(docPath, doc)
  await copyFile(join(cacheDir, `${name}.aux`), join(cacheDir, `${job}.aux`)).catch(() => {})
  // biblatex takes its citations from the .bbl. BibTeX's come from \bibcite
  // in the .aux; its .bbl would only be typeset (revtex does at the end).
  const biblatex = await stat(join(cacheDir, `${name}.bcf`)).then(() => true, () => false)
  if (biblatex) await copyFile(join(cacheDir, `${name}.bbl`), join(cacheDir, `${job}.bbl`)).catch(() => {})
  else await rm(join(cacheDir, `${job}.bbl`), { force: true })

  const preamble = vault.fastCompile ? preambleOf(rootText) : null
  const format = await formatFor(vault, root, cacheDir, name, preamble, Object.keys(buffers).length ? buffers : null)
  const logPath = join(cacheDir, `${job}.log`)
  const pass = async (fmt: string | null) => {
    await rm(logPath, { force: true }).catch(() => {})
    const args = [...baseArgsFor(cacheDir), `-jobname=${job}`, ...(fmt ? [`-fmt=${fmt}`] : []), docPath]
    await runTool('pdflatex', args, shadow ?? vault.root, texEnv(vault, relDir, shadow)).catch(() => {})
    return readFile(logPath, 'utf8').catch(() => '')
  }
  let log = await pass(format?.fmt ?? null)
  if (gen !== generation) return stale()
  // As in build(): a format pdflatex can't load is dropped, and the pass run without it.
  const formatKey = preamble && `${cacheDir}|${preambleHash(preamble)}`
  let preloaded = !!format
  if (format && formatKey && !log) {
    badFormats.add(formatKey)
    await dropFormat(cacheDir, name)
    preloaded = false
    log = await pass(null)
    if (gen !== generation) return stale()
  }

  // The log names this job's file; problems in it are the root's (its lines are the root's lines).
  if (shadow) log = unshadow(log)
  for (const p of new Set([docPath, docPath.replace(/\\/g, '/')])) log = log.split(p).join(vault.abs(root))
  await writeFile(join(cacheDir, `${job}.log`), log).catch(() => {})

  const overrides = new Map(Object.entries(buffers).map(([r, t]) => [resolve(vault.abs(r)).toLowerCase(), t]))
  const problems = (await diagnose(parseLog(log), diagnoseContext(vault, root, log, fullAux(vault, root), overrides)))
    // Its own .aux differs from the full build's by design: not worth a rerun warning.
    .filter((p) => !/rerun|may have changed/i.test(p.title))
  const pdf = join(cacheDir, `${job}.pdf`)
  const pdfExists = await stat(pdf).then(() => true, () => false)
  const ok = pdfExists && !problems.some((p) => p.severity === 'error' && !p.hidden)
  const result: CompileResult = { ok, root, passes: 1, pdf: pdfExists ? pdf : null, problems, log, durationMs: Date.now() - started, draft, preloaded, section: label }
  await runAfterBuild({ kind: 'section', vault, root, cacheDir, name, buffers, auxPath: fullAux(vault, root), result })
  return result
}

/**
 * Builds a generated document `source` as `<dir>/<name>.tex`, e.g. a
 * plugin's preview of one problem. It runs from the vault root (so its
 * images and classes resolve), alongside any document build rather than
 * cancelling it, and publishes nothing to pdf/.
 */
export async function compileScratch(vault: Vault, dir: string, name: string, source: string): Promise<CompileResult> {
  const started = Date.now()
  await mkdir(dir, { recursive: true })
  const texPath = join(dir, `${name}.tex`)
  await writeFile(texPath, source)
  const logPath = join(dir, `${name}.log`)
  const env = texEnv(vault, '', null)
  let log = ''
  let passes = 0
  for (; passes < 2; ) {
    passes++
    await rm(logPath, { force: true }).catch(() => {})
    await runTool('pdflatex', [...baseArgsFor(dir), texPath], vault.root, env, false).catch(() => {})
    log = await readFile(logPath, 'utf8').catch(() => '')
    if (!log || !RERUN.test(log)) break
  }
  const problems = await diagnose(parseLog(log), diagnoseContext(vault, texPath, log, join(dir, `${name}.aux`)))
  const pdf = join(dir, `${name}.pdf`)
  const pdfExists = await stat(pdf).then(() => true, () => false)
  const ok = pdfExists && !problems.some((p) => p.severity === 'error' && !p.hidden)
  return { ok, root: texPath, passes, pdf: pdfExists ? pdf : null, problems, log, durationMs: Date.now() - started, draft: true }
}

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

/**
 * Runs one pass of `cmd` (pdflatex, bibtex, biber), cancelling any still in
 * flight from an earlier save. A pass that isn't `exclusive` neither
 * cancels nor can be cancelled.
 */
function runTool(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, exclusive = true): Promise<void> {
  if (exclusive) running?.kill()
  return new Promise((resolvePass, reject) => {
    const child = spawn(cmd, args, { cwd, env, windowsHide: true })
    if (exclusive) running = child
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
