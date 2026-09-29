// The compile pipeline proven in spikes/compile.ps1:
//   - pdflatex runs from the vault root, so Images/... resolves as before;
//   - classes come from the shared template library via TEXINPUTS;
//   - aux, log, synctex and the working PDF live in .texcache/<reldir>/<name>/;
//   - a successful PDF is copied to pdf/<reldir>/<name>.pdf.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, posix } from 'node:path'
import type { CompileResult } from '../shared/api'
import { diagnose, type DiagnoseContext } from './diagnose'
import { parseLog } from './logparser'
import { definitionsFor } from './macros'
import type { Vault } from './vault'

const MAX_PASSES = 4
const PASS_TIMEOUT_MS = 120_000
const RERUN = /Rerun to get|Label\(s\) may have changed|Rerun LaTeX/
// Any error line, in -file-line-error form (`path:12: ...`) or TeX's own (`! ...`).
const HAS_ERROR = /^(?:.+?\.[A-Za-z]{1,8}:\d+: |! )/m

let running: ChildProcess | null = null
/** Bumped by every compile; an older compile stops once it sees a newer one. */
let generation = 0
let lastRoot: string | null = null

/**
 * Which document to compile when `rel` is saved. In order: a `% !TEX root`
 * magic comment, the file itself if it has a \documentclass, otherwise the
 * last document compiled (so saving an \input'ed piece rebuilds its parent).
 */
export async function resolveRoot(vault: Vault, rel: string): Promise<string | null> {
  if (!rel.endsWith('.tex')) return lastRoot
  const text = await readFile(vault.abs(rel), 'utf8')
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

export async function compile(vault: Vault, rel: string): Promise<CompileResult> {
  const started = Date.now()
  const root = await resolveRoot(vault, rel)
  if (!root) {
    return {
      ok: false, root: rel, passes: 0, pdf: null, durationMs: 0, log: '',
      problems: [{
        rule: 'not-a-document', severity: 'error', file: rel, line: null, fixes: [], tex: '',
        title: 'Nothing to compile',
        explanation: 'This file has no \\documentclass, and no document has been compiled yet to rebuild instead. Open and save the main document first.',
      }],
    }
  }
  lastRoot = root
  const gen = ++generation

  const relDir = posix.dirname(root) === '.' ? '' : posix.dirname(root)
  const name = posix.basename(root, '.tex')
  const cacheDir = cacheDirFor(vault, root)
  const pdfDir = join(vault.root, 'pdf', relDir)
  await mkdir(cacheDir, { recursive: true })

  const env = { ...process.env }
  // '//' searches subfolders; the trailing ';' keeps MiKTeX's default path.
  if (vault.templates) env.TEXINPUTS = `${vault.templates}//;`

  const args = [
    '-synctex=1', '-interaction=nonstopmode', '-file-line-error',
    '-max-print-line=10000', // one message per line, no 79-column wrapping
    `-aux-directory=${cacheDir}`, `-output-directory=${cacheDir}`, root,
  ]

  const logPath = join(cacheDir, `${name}.log`)
  let passes = 0
  let log = ''
  do {
    passes++
    await runPdflatex(args, vault.root, env)
    if (gen !== generation) {
      return { ok: false, root, passes, pdf: null, problems: [], log: '', durationMs: Date.now() - started }
    }
    log = await readFile(logPath, 'utf8').catch(() => '')
    // Rerunning can't fix an error, so only rerun a clean pass that asks for it.
  } while (!HAS_ERROR.test(log) && RERUN.test(log) && passes < MAX_PASSES)

  const problems = await diagnose(parseLog(log), diagnoseContext(vault, root, log, join(cacheDir, `${name}.aux`)))
  const cachePdf = join(cacheDir, `${name}.pdf`)
  const pdfExists = await stat(cachePdf).then(() => true, () => false)
  const ok = pdfExists && !problems.some((p) => p.severity === 'error' && !p.hidden)
  if (ok) {
    await mkdir(pdfDir, { recursive: true })
    await copyFile(cachePdf, join(pdfDir, `${name}.pdf`))
  }
  return { ok, root, passes, pdf: pdfExists ? cachePdf : null, problems, log, durationMs: Date.now() - started }
}

/** What the diagnosis rules may look at, read lazily and at most once. */
export function diagnoseContext(vault: Vault, doc: string, log: string, auxPath: string): DiagnoseContext {
  const once = <T>(f: () => Promise<T>) => {
    let p: Promise<T> | null = null
    return () => (p ??= f())
  }
  const texts = new Map<string, Promise<string | null>>()
  const read = (file: string) => {
    const abs = isAbsolute(file) ? file : vault.abs(file)
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
  }
}

/** Runs one pdflatex pass, cancelling any pass still in flight from an earlier save. */
function runPdflatex(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  running?.kill()
  return new Promise((resolvePass, reject) => {
    const child = spawn('pdflatex', args, { cwd, env, windowsHide: true })
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
