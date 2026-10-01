// Bibliographies: running BibTeX or biber as part of a build, and reading
// a document's .bib files for the editor.
//
// A build runs the bibliography tool after a pdflatex pass when the .aux
// asks for one (\bibdata for BibTeX; a .bcf file for biblatex/biber) and
// what it depends on has changed: the cited keys, the style, or a .bib
// file. That fingerprint is kept in <cache>/<name>.bibkey, so a save that
// doesn't touch citations never reruns BibTeX.
//
// BibTeX runs in the document's cache folder, where the .aux is (and
// revtex's generated <name>Notes.bib); BIBINPUTS finds the vault's .bib
// files, and BSTINPUTS the template folders' styles.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import type { BibInfo, Problem } from '../shared/api'
import { blankComments } from '../shared/latexedit'
import { bibciteLabels, parseBib, parseBlg, summarize, type BibEntry, type BibSummary } from '../shared/bibtex'
import type { Vault } from './vault'

export type BibTool = 'bibtex' | 'biber'

/** What a build needs to know to run the bibliography step. */
export interface BibJob {
  vault: Vault
  /** The document, vault-relative. */
  root: string
  cacheDir: string
  name: string
  /** The preview's shadow folder, if the build has one. */
  shadow: string | null
  /** Unsaved buffers by vault-relative path (preview builds). */
  buffers: Record<string, string> | null
  /** When the build started (ms): a .bcf older than this is left over from an earlier build. */
  started: number
}

export interface BibNeeds {
  tool: BibTool
  /** Fingerprint of everything the tool reads. */
  key: string
  /** The vault's .bib files it reads (absolute), not generated ones. */
  files: string[]
}

/** The tool the .aux asks for, and the fingerprint of what it depends on; null when there's no bibliography. */
export async function bibNeeds(job: BibJob): Promise<BibNeeds | null> {
  const auxPath = join(job.cacheDir, `${job.name}.aux`)
  const aux = await readAuxTree(auxPath, job.cacheDir)
  if (aux == null) return null
  const hash = createHash('sha1')
  let tool: BibTool
  let bibNames: string[]
  if (/\\bibdata\{/.test(aux)) {
    tool = 'bibtex'
    const relevant = aux.split(/\r?\n/).filter((l) => /^\\(citation|bibdata|bibstyle)\{/.test(l))
    hash.update(relevant.join('\n'))
    bibNames = [...aux.matchAll(/\\bibdata\{([^}]*)\}/g)].flatMap((m) => m[1].split(',')).map((s) => s.trim()).filter(Boolean)
  } else {
    const bcfPath = join(job.cacheDir, `${job.name}.bcf`)
    const bcf = await stat(bcfPath).catch(() => null)
    if (!bcf || bcf.mtimeMs < job.started - 1000) return null
    const text = await readFile(bcfPath, 'utf8')
    tool = 'biber'
    hash.update(text)
    bibNames = [...text.matchAll(/<bcf:datasource[^>]*>([^<]+)<\/bcf:datasource>/g)].map((m) => m[1].trim())
  }
  // The .bib files themselves: unsaved text in a preview, otherwise size and time.
  const files: string[] = []
  for (const n of bibNames) {
    const file = await findBib(job.vault, job.root, n, [job.cacheDir])
    if (!file) {
      hash.update(`missing:${n}`)
      continue
    }
    const rel = job.vault.rel(file)
    const unsaved = rel ? job.buffers?.[rel] : undefined
    if (unsaved !== undefined) hash.update(`${n}:${unsaved}`)
    else if (!rel || file.startsWith(job.cacheDir)) {
      // Generated each pass (revtex's <name>Notes.bib): only its contents count.
      hash.update(`${n}:${await readFile(file, 'utf8').catch(() => '')}`)
    } else {
      const s = await stat(file).catch(() => null)
      hash.update(`${n}:${s?.size}:${s?.mtimeMs}`)
    }
    if (rel && !file.startsWith(job.cacheDir)) files.push(file)
  }
  return { tool, key: hash.digest('hex'), files }
}

/** Whether the tool must run: its inputs changed since last time, or its output is missing. */
export async function bibStale(job: BibJob, key: string): Promise<boolean> {
  const [old, bbl] = await Promise.all([
    readFile(join(job.cacheDir, `${job.name}.bibkey`), 'utf8').catch(() => null),
    stat(join(job.cacheDir, `${job.name}.bbl`)).catch(() => null),
  ])
  return !bbl || old?.trim() !== key
}

export const saveBibKey = (job: BibJob, key: string) => writeFile(join(job.cacheDir, `${job.name}.bibkey`), key)

/** Forgets the fingerprint, so the next build runs the tool again (after it failed). */
export const dropBibKey = (job: BibJob) => writeFile(join(job.cacheDir, `${job.name}.bibkey`), '')

type Runner = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => Promise<void>

/**
 * Runs the tool `needs` asks for with `run` (the build's cancellable
 * runner), and returns the problems in its log.
 */
export async function runBib(job: BibJob, needs: BibNeeds, env: NodeJS.ProcessEnv, run: Runner): Promise<Problem[]> {
  const c = bibCommand(job, needs.tool, env)
  // Never report the last run's log as this one's.
  await rm(join(job.cacheDir, `${job.name}.blg`), { force: true })
  if (job.shadow) {
    // biber reads relative paths (../refs.bib) from its working folder in
    // the shadow: it has to exist, with the saved .bib files beside the unsaved ones.
    await mkdir(c.cwd, { recursive: true })
    for (const f of needs.files) {
      const rel = job.vault.rel(f)
      if (!rel || job.buffers?.[rel] !== undefined) continue
      const copy = join(job.shadow, rel)
      await mkdir(dirname(copy), { recursive: true })
      await copyFile(f, copy).catch(() => {})
    }
  }
  try {
    await run(c.cmd, c.args, c.cwd, c.env)
  } catch (e) {
    return [{
      rule: `${needs.tool}-missing`, severity: 'error', file: job.root, line: null, fixes: [], tex: String(e),
      title: `${needs.tool === 'bibtex' ? 'BibTeX' : 'biber'} couldn't run`,
      explanation: `The document needs ${needs.tool} for its bibliography, but it couldn't be started. It comes with MiKTeX; check that it's installed (MiKTeX Console → Packages).`,
    }]
  }
  return bibProblems(job, needs.tool, needs.files)
}

/** The command line, working folder and environment for running `tool`. */
export function bibCommand(job: BibJob, tool: BibTool, env: NodeJS.ProcessEnv): { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const docDir = posix.dirname(job.root)
  const inShadow = (d: string) => (job.shadow ? [join(job.shadow, d), job.shadow] : [])
  const bibDirs = [...new Set([...inShadow(docDir), job.vault.abs(docDir), job.vault.root])]
  const toolEnv = {
    ...env,
    BIBINPUTS: bibDirs.map((d) => `${d}${delimiter}`).join(''),
    BSTINPUTS: job.vault.templateDirs.map((d) => `${d}//${delimiter}`).join('') || undefined,
  }
  if (tool === 'bibtex') return { cmd: 'bibtex', args: [job.name], cwd: job.cacheDir, env: toolEnv }
  const cwd = job.shadow ? join(job.shadow, docDir) : job.vault.abs(docDir)
  return { cmd: 'biber', args: [`--input-directory=${job.cacheDir}`, `--output-directory=${job.cacheDir}`, job.name], cwd, env: toolEnv }
}

/** The .aux, with the .aux files of \include'd parts appended. Null when there's none. */
async function readAuxTree(auxPath: string, cacheDir: string, depth = 0): Promise<string | null> {
  const aux = await readFile(auxPath, 'utf8').catch(() => null)
  if (aux == null || depth > 5) return aux
  let out = aux
  for (const m of aux.matchAll(/\\@input\{([^}]+\.aux)\}/g)) {
    const child = await readAuxTree(resolve(cacheDir, m[1]), cacheDir, depth + 1)
    if (child) out += `\n${child}`
  }
  return out
}

/**
 * The problems in the tool's log, with files made vault-relative. BibTeX
 * names .bib files as it found them (full paths when found via BIBINPUTS).
 */
export async function bibProblems(job: BibJob, tool: BibTool, files: string[] = []): Promise<Problem[]> {
  const blg = await readFile(join(job.cacheDir, `${job.name}.blg`), 'utf8').catch(() => '')
  const out: Problem[] = []
  for (const m of parseBlg(blg)) {
    let file: string | null = null
    // biber names a temporary copy; with one .bib, that's the one.
    if (!m.file && m.line != null && files.length === 1) file = job.vault.rel(files[0])
    if (m.file) {
      const found = isAbsolute(m.file) ? m.file : await findBib(job.vault, job.root, m.file, [job.cacheDir])
      file = found ? (job.vault.rel(unshadowPath(job, found)) ?? found) : m.file
    }
    out.push({
      rule: m.severity === 'error' ? `${tool}-error` : `${tool}-warning`,
      severity: m.severity,
      file,
      line: m.line,
      title: m.message,
      explanation: tool === 'bibtex' && m.severity === 'error' && m.line ? 'BibTeX stops reading an entry at its first error, so its citation may print as [?] until this is fixed.' : undefined,
      fixes: [],
      hidden: m.hidden,
      tex: m.line && m.file ? `${m.message} (line ${m.line} of ${m.file})` : m.message,
    })
  }
  return out
}

/** A path inside the preview's shadow folder, as the vault path it copies. */
function unshadowPath(job: BibJob, abs: string): string {
  if (!job.shadow) return abs
  const r = relative(job.shadow, abs)
  return r.startsWith('..') || isAbsolute(r) ? abs : join(job.vault.root, r)
}

/**
 * Where a \bibliography name (with or without .bib) is: next to the
 * document, then at the vault root, then in `extra` folders. Null when
 * it's nowhere (or it's a system-wide .bib, which the editor doesn't read).
 */
export async function findBib(vault: Vault, root: string, name: string, extra: string[] = []): Promise<string | null> {
  const file = /\.bib$/i.test(name) ? name : `${name}.bib`
  const docDir = vault.abs(posix.dirname(root))
  for (const dir of [docDir, vault.root, ...extra]) {
    const p = resolve(dir, file)
    if (await stat(p).then((s) => s.isFile(), () => false)) return p
  }
  return null
}

/** The .bib names a document's source asks for: \bibliography{a,b} and \addbibresource{x.bib}. */
export function bibNamesIn(text: string): string[] {
  const src = blankComments(text)
  const out: string[] = []
  for (const m of src.matchAll(/\\bibliography\s*\{([^}]*)\}/g)) out.push(...m[1].split(','))
  for (const m of src.matchAll(/\\addbibresource\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) out.push(m[1])
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))]
}

// Parsed .bib files, by absolute path, kept while the file is unchanged.
const parsed = new Map<string, { mtimeMs: number; size: number; entries: BibEntry[] }>()

async function entriesOf(abs: string): Promise<BibEntry[]> {
  const s = await stat(abs).catch(() => null)
  if (!s) return []
  const hit = parsed.get(abs)
  if (hit && hit.mtimeMs === s.mtimeMs && hit.size === s.size) return hit.entries
  const entries = parseBib(await readFile(abs, 'utf8').catch(() => ''))
  parsed.set(abs, { mtimeMs: s.mtimeMs, size: s.size, entries })
  return entries
}


/** The document's bibliography: its .bib files' entries, and the labels its last build gave them. */
export async function bibInfo(vault: Vault, root: string, cacheDir: string): Promise<BibInfo> {
  const text = await readFile(vault.abs(root), 'utf8').catch(() => '')
  const bibs: string[] = []
  const missing: string[] = []
  const entries: BibSummary[] = []
  const seen = new Set<string>()
  for (const n of bibNamesIn(text)) {
    const abs = await findBib(vault, root, n)
    const rel = abs && vault.rel(abs)
    if (!abs || !rel) {
      missing.push(n)
      continue
    }
    bibs.push(rel)
    for (const e of await entriesOf(abs)) {
      if (seen.has(e.key)) continue
      seen.add(e.key)
      entries.push(summarize(e, rel))
    }
  }
  const name = posix.basename(root, '.tex')
  const aux = await readAuxTree(join(cacheDir, `${name}.aux`), cacheDir).catch(() => null)
  return { bibs, missing, entries, labels: aux ? bibciteLabels(aux) : {} }
}

/** Every key in the document's .bib files (for diagnosing an undefined citation). */
export async function bibKeys(vault: Vault, root: string, overrides?: Map<string, string>): Promise<string[]> {
  const rootAbs = resolve(vault.abs(root)).toLowerCase()
  const text = overrides?.get(rootAbs) ?? (await readFile(vault.abs(root), 'utf8').catch(() => ''))
  const keys: string[] = []
  for (const n of bibNamesIn(text)) {
    const abs = await findBib(vault, root, n)
    if (!abs) continue
    const unsaved = overrides?.get(resolve(abs).toLowerCase())
    const entries = unsaved !== undefined ? parseBib(unsaved) : await entriesOf(abs)
    for (const e of entries) keys.push(e.key)
  }
  return keys
}
