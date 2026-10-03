import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { PluginMain } from '../../main/plugins'
import { joinRel, type Include } from '@shared/project'
import { normalizeEol } from '@shared/search'
import { buildDocument, entryFor, type BankIndex, type CheckResult, makeFragment, newFragmentPath, scanIncludes, serializeProblem, usedIn, type Fragment, type ProblemMeta } from './bank'

const hidden = (rel: string) => rel.split('/').some((p) => p.startsWith('.'))

const main: PluginMain = async (ctx) => {
  // The problem files of the vault's bank, and every other .tex file's includes.
  const fragments = new Map<string, Fragment>()
  const includes = new Map<string, Include[]>()
  let library: Fragment[] = []
  const checks = new Map<string, CheckResult>()
  let current: BankIndex | null = null

  const bank = () => joinRel(String(ctx.settings.vault().bank ?? 'Problems'))
  const preambleRel = () => joinRel(bank(), '_preamble.tex')
  const isFragment = (rel: string) => {
    const b = bank().toLowerCase()
    return /\.tex$/i.test(rel) && (!b || rel.toLowerCase().startsWith(`${b}/`)) && !rel.slice(rel.lastIndexOf('/') + 1).startsWith('_')
  }
  const isTex = (rel: string) => /\.tex$/i.test(rel) && !hidden(rel)

  const cacheFile = join(ctx.cacheDir, 'index.json')

  const readOne = async (rel: string) => {
    if (isFragment(rel)) {
      const [text, st] = await Promise.all([ctx.vault.read(rel), stat(ctx.vault.abs(rel))])
      fragments.set(rel, makeFragment(rel, text, { library: false, mtime: Math.floor(st.mtimeMs) }))
    } else includes.set(rel, scanIncludes(await ctx.vault.read(rel)))
  }

  /** The shared library's problems (a folder anywhere on disk). */
  const scanLibrary = async () => {
    const dir = String(ctx.settings.global().library ?? '').trim()
    const found: Fragment[] = []
    const walk = async (d: string) => {
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (e.name.startsWith('.') || e.name.startsWith('_')) continue
        const abs = join(d, e.name)
        if (e.isDirectory()) await walk(abs)
        else if (/\.tex$/i.test(e.name)) {
          const [text, st] = await Promise.all([readFile(abs, 'utf8'), stat(abs)])
          found.push(makeFragment(`lib:${relative(dir, abs).replace(/\\/g, '/')}`, text, { library: true, mtime: Math.floor(st.mtimeMs) }))
        }
      }
    }
    if (dir) await walk(dir)
    library = found
  }

  const rebuild = async () => {
    const hasPreamble = (await ctx.vault.readOptional(preambleRel())) !== null
    const used = usedIn([...fragments.keys()], new Map([...includes].filter(([rel]) => !fragments.has(rel))))
    const all = [...fragments.values()].map((f) => ({ ...f, usedIn: used.get(f.id) ?? [] }))
    all.push(...library)
    all.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
    for (const [id, r] of checks) if (all.find((f) => f.id === id)?.mtime !== r.mtime) checks.delete(id)
    current = { fragments: all, checks: Object.fromEntries(checks), bank: bank(), hasPreamble }
    await mkdir(ctx.cacheDir, { recursive: true })
    await writeFile(cacheFile, JSON.stringify(current)).catch(() => {})
    ctx.emit('index')
  }

  /** Everything from scratch: at start-up and after a setting changes. */
  const scanAll = async () => {
    fragments.clear()
    includes.clear()
    for (const rel of await ctx.vault.files()) if (isTex(rel)) await readOne(rel).catch(() => {})
    await scanLibrary()
    await rebuild()
  }

  // Work happens one job at a time.
  let chain: Promise<unknown> = Promise.resolve()
  const job = <T>(run: () => Promise<T>): Promise<T> => {
    const next = chain.then(run)
    chain = next.catch((e) => console.error('Problem bank:', e))
    return next
  }

  // File changes are batched.
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const apply = async () => {
    const rels = [...pending]
    pending.clear()
    for (const rel of rels) {
      fragments.delete(rel)
      includes.delete(rel)
      if ((await ctx.vault.readOptional(rel)) !== null) await readOne(rel).catch(() => {})
    }
    // The library is outside the vault: it's read again on a refresh or a settings change, not on every save.
    await rebuild()
  }
  ctx.vault.onFile((_event, rel) => {
    if (!isTex(rel)) return
    pending.add(rel)
    clearTimeout(timer)
    timer = setTimeout(() => void job(apply).catch(() => {}), 250)
  })
  ctx.onDispose(() => clearTimeout(timer))
  ctx.settings.onChange(() => void job(scanAll).catch(() => {}))

  // The last index serves the first question while the first scan runs.
  try {
    current = JSON.parse(await readFile(cacheFile, 'utf8')) as BankIndex
  } catch {
    current = null
  }
  const first = job(scanAll)
  first.catch(() => {})

  ctx.handle('index', async (): Promise<BankIndex> => {
    if (!current) await first
    return current!
  })
  ctx.handle('refresh', () => job(scanAll))

  // Checks run one at a time: they share one scratch document.
  const check = async (f: Fragment): Promise<CheckResult> => {
    const pre = await ctx.vault.readOptional(preambleRel())
    const source = buildDocument({ preamble: pre, documentClass: String(ctx.settings.vault().previewClass || 'exam'), entries: [entryFor(f)] })
    const r = await ctx.build.scratch('check', source)
    const errors = r.problems.filter((p) => p.severity === 'error' && !p.hidden).slice(0, 5)
    const result: CheckResult = { ok: r.ok, errors: errors.map((p) => ({ title: p.title, line: p.line, file: p.file })), mtime: f.mtime }
    checks.set(f.id, result)
    return result
  }
  let checking: Promise<unknown> = Promise.resolve()
  const queued = <T>(run: () => Promise<T>): Promise<T> => {
    const next = checking.then(run)
    checking = next.catch(() => {})
    return next
  }
  ctx.handle('check', (id: string) =>
    queued(async () => {
      const f = current?.fragments.find((x) => x.id === id)
      if (!f) throw new Error('That problem is gone')
      const result = await check(f)
      ctx.emit('checked', { id, result })
      return result
    }),
  )
  ctx.handle('checkAll', () =>
    queued(async () => {
      const list = current?.fragments ?? []
      let bad = 0
      for (const f of list) {
        const result = await check(f).catch((e: Error): CheckResult => ({ ok: false, errors: [{ title: e.message, line: null, file: null }], mtime: f.mtime }))
        if (!result.ok) bad++
        ctx.emit('checked', { id: f.id, result })
      }
      return { total: list.length, bad }
    }),
  )

  /** Writes a new problem file in the bank (never over another) and says where. */
  ctx.handle('save', async (meta: Partial<ProblemMeta>, body: string): Promise<{ rel: string; arg: string }> => {
    const taken = new Set((await ctx.vault.files()).map((f) => f.toLowerCase()))
    const rel = newFragmentPath(bank(), meta.title || 'problem', (r) => taken.has(r.toLowerCase()))
    await ctx.vault.write(rel, serializeProblem(meta, body))
    return { rel, arg: rel.replace(/\.tex$/i, '') }
  })

  /** Writes a new assignment holding the given problems; refuses to overwrite a file. */
  ctx.handle('assignment', async (name: string, ids: string[]): Promise<{ rel?: string; error?: string }> => {
    const clean = name.trim().replace(/\\/g, '/').replace(/\.tex$/i, '')
    if (!clean || clean.split('/').some((p) => !p || p === '.' || p === '..') || /[<>:"|?*]/.test(clean)) return { error: 'That is not a usable file name' }
    const rel = `${clean}.tex`
    if ((await ctx.vault.readOptional(rel)) !== null) return { error: `${rel} already exists` }
    const entries = ids.flatMap((id) => current?.fragments.find((f) => f.id === id) ?? [])
    if (!entries.length) return { error: 'None of the marked problems exist any more' }
    const pre = await ctx.vault.readOptional(preambleRel())
    const documentClass = String(ctx.settings.vault().previewClass || 'exam')
    await ctx.vault.write(rel, normalizeEol(buildDocument({ preamble: pre, documentClass, entries: entries.map(entryFor) })))
    return { rel }
  })
}

export default main
