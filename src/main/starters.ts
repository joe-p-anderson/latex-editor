// Lists starters (single files and folders) from the built-in folder and the
// template folders' starters/, and writes one out (New file, New vault).
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, extname, basename, dirname } from 'node:path'
import { lineBreakOf, withLineBreaks } from '../shared/edits'
import { fill, splitHeader, starterFields, STARTER_TEXT, type AutoValues, type Starter, type StarterFile } from '../shared/starters'
import type { PluginManifest } from '../shared/plugin'
import type { Vault } from './vault'

/** The single-file starters' extensions. */
const EXTS = new Set(['.tex', '.bib', '.md', '.txt'])

let builtInFolder = join(process.cwd(), 'resources', 'starters')

/**
 * Where the built-in starters are read from: resources/starters/ in the repo
 * (development) or in the app (packaged). Set once at startup.
 */
export function useBuiltInStarters(folder: string): void {
  builtInFolder = folder
}

/** A folder's files, relative and with forward slashes, sorted. */
async function filesUnder(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(join(dir, prefix), { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await filesUnder(dir, rel)))
    else if (e.isFile()) out.push(rel)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** A folder starter's entry file: its main.tex, else its only top-level .tex file, else none. */
function entryOf(files: string[]): string | null {
  const top = files.filter((f) => !f.includes('/') && extname(f).toLowerCase() === '.tex')
  return top.find((f) => f.toLowerCase() === 'main.tex') ?? (top.length === 1 ? top[0] : null)
}

/** The folder starter at `dir`, or null when it has no entry file. */
async function readFolder(dir: string): Promise<Omit<Starter, 'id' | 'source'> | null> {
  const all = await filesUnder(dir)
  const entry = entryOf(all)
  if (!entry) return null
  const text = await readFile(join(dir, entry), 'utf8')
  const files: StarterFile[] = []
  for (const path of all) {
    if (path === entry) continue
    if (basename(path) === '.keep') {
      const folder = path.slice(0, path.lastIndexOf('/'))
      if (folder &&!all.some((f) => f !== path && f.startsWith(folder + '/'))) files.push({ path: folder, kind: 'folder' })
    } else if (STARTER_TEXT.has(extname(path).toLowerCase())) {
      files.push({ path, kind: 'text', text: await readFile(join(dir, path), 'utf8') })
    } else files.push({ path, kind: 'binary' })
  }
  return { name: basename(dir), ext: extname(entry).toLowerCase(), description: splitHeader(text).description, text, folder: dir, files }
}

/** The starters in `folder`, files and folders, with ids `${source}:${entry name}`. */
async function readStarters(folder: string, source: Starter['source']): Promise<Starter[]> {
  const out: Starter[] = []
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const id = `${source}:${e.name}`
    if (e.isDirectory()) {
      const s = await readFolder(join(folder, e.name)).catch(() => null)
      if (s) out.push({ ...s, id, source })
      continue
    }
    const ext = extname(e.name).toLowerCase()
    if (!e.isFile() || !EXTS.has(ext)) continue
    const raw = await readFile(join(folder, e.name), 'utf8').catch(() => null)
    if (raw == null) continue
    out.push({ id, name: basename(e.name, extname(e.name)), ext, description: splitHeader(raw).description, source, text: raw })
  }
  return out
}

/** Built-in starters in the order the dialog lists them: .tex first, then .bib, .md and .txt; the blank one first of its kind. */
const ORDER = ['.tex', '.bib', '.md', '.txt']
const builtInOrder = (a: Starter, b: Starter) =>
  ORDER.indexOf(a.ext) - ORDER.indexOf(b.ext) || Number(!a.name.startsWith('Blank')) - Number(!b.name.startsWith('Blank')) || a.name.localeCompare(b.name)

/**
 * The built-in starters (resources/starters/), those the vault's plugins ship
 * (`plugins`), and those in `starters/` under each template folder. A starter
 * of the user's takes the place of a built-in or plugin one of the same name.
 */
export async function listStarters(vault: Vault, plugins: PluginManifest[] = []): Promise<Starter[]> {
  const builtIn = (await readStarters(builtInFolder, 'built-in')).sort(builtInOrder)
  const shipped: Starter[] = plugins.flatMap((m) =>
    (m.starters ?? []).map((s, i) => ({ ext: '.tex', ...s, id: `plugin:${m.id}:${i}`, source: 'built-in' as const })),
  )
  const out: Starter[] = []
  for (const dir of vault.templateDirs) {
    out.push(...(await readStarters(join(dir, 'starters'), dir === vault.globalTemplates ? 'global' : 'vault')))
  }
  const own = new Set(out.map((s) => s.name.toLowerCase()))
  return [...[...builtIn, ...shipped].filter((s) => !own.has(s.name.toLowerCase())), ...out]
}

const exists = (abs: string) => stat(abs).then(() => true, () => false)

/** The starter's text filled in, with its own line breaks kept (values typed in have 
 breaks). */
const filled = (text: string, values: Record<string, string>, auto: AutoValues) => withLineBreaks(fill(text, values, auto), lineBreakOf(text))

/**
 * Makes `entry` (vault-relative) from the starter, and a folder starter's
 * other files relative to it, filled from `values` (a field not given takes
 * its default). Fails, writing nothing, if `entry` exists; any other file
 * that already exists is left as it is.
 */
export async function writeStarter(vault: Vault, entry: string, starter: Starter, values: Record<string, string>, auto: AutoValues): Promise<void> {
  const all = { ...Object.fromEntries(starterFields(starter).map((f) => [f.name, f.default])), ...values }
  const abs = vault.abs(entry)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, filled(starter.text, all, auto), { encoding: 'utf8', flag: 'wx' }).catch((e) => {
    throw e?.code === 'EEXIST' ? new Error(`${entry} already exists`) : e
  })
  const base = dirname(entry)
  for (const f of starter.files ?? []) {
    const to = vault.abs(join(base, f.path))
    if (f.kind === 'folder') {
      await mkdir(to, { recursive: true })
      continue
    }
    if (await exists(to)) continue
    await mkdir(dirname(to), { recursive: true })
    if (f.kind === 'text') await writeFile(to, filled(f.text, all, auto), { encoding: 'utf8', flag: 'wx' })
    else if (starter.folder) await copyFile(join(starter.folder, f.path), to)
  }
}

/**
 * The starters/ folder a starter from `source` lives in, made if missing: the
 * vault's for vault starters, the global one for global starters, and for the
 * built-in ones the vault's when it has a template folder, else the global one.
 */
export async function startersFolder(vault: Vault, source: Starter['source']): Promise<string | null> {
  const dir = source === 'global' ? vault.globalTemplates : (vault.vaultTemplates ?? vault.globalTemplates)
  if (!dir) return null
  const folder = join(dir, 'starters')
  await mkdir(folder, { recursive: true })
  return folder
}
