// The paper a file belongs to: a root document and the files it \inputs,
// read from disk (or from unsaved buffers). The graph is cached per root and
// kept while none of its files has changed on disk.
import { readFile, stat } from 'node:fs/promises'
import { posix } from 'node:path'
import type { PaperInfo } from '../shared/api'
import { isDocument, paperFiles, parseIncludes, type PaperFile } from '../shared/project'
import type { Vault } from './vault'

interface Cached {
  files: PaperFile[]
  texts: Map<string, string>
  /** Each file's mtime (or -1 when missing) when it was read. */
  stamps: Map<string, number>
}
const graphs = new Map<string, Cached>()

// -1 when it isn't a file (or is outside the vault).
const mtime = async (vault: Vault, rel: string) => stat(vault.abs(rel)).then((s) => (s.isFile() ? s.mtimeMs : -1)).catch(() => -1)

/**
 * The files of the paper rooted at `root`, root first, in reading order, and
 * their texts. `overrides` (unsaved text by vault-relative path) are read in
 * place of the files; such a graph isn't cached.
 */
export async function paperGraph(vault: Vault, root: string, overrides?: Record<string, string>): Promise<{ files: PaperFile[]; texts: Map<string, string> }> {
  const key = `${vault.root}|${root}`
  const hit = graphs.get(key)
  if (!overrides && hit && (await fresh(vault, hit))) return hit
  // Every path looked at, found or not, so adding a missing file is noticed too.
  const stamps = new Map<string, number>()
  const exists = async (rel: string) => {
    if (overrides?.[rel] != null) return true
    if (!stamps.has(rel)) stamps.set(rel, await mtime(vault, rel))
    return stamps.get(rel)! >= 0
  }
  const read = async (rel: string) => overrides?.[rel] ?? readFile(vault.abs(rel), 'utf8').catch(() => null)
  const { files, texts } = await paperFiles(root, read, exists)
  const out = { files, texts, stamps }
  if (!overrides) graphs.set(key, out)
  return out
}

async function fresh(vault: Vault, c: Cached): Promise<boolean> {
  for (const [rel, t] of c.stamps) if ((await mtime(vault, rel)) !== t) return false
  return true
}

/**
 * The declared paper (in .vault.json) that includes `rel`, or null. When
 * several do, the first listed wins.
 */
export async function declaredPaperOf(vault: Vault, rel: string): Promise<string | null> {
  for (const root of vault.papers) {
    if (root === rel) return root
    const { files } = await paperGraph(vault, root).catch(() => ({ files: [] as PaperFile[] }))
    if (files.some((f) => f.rel === rel && f.exists)) return root
  }
  return null
}

/**
 * A document in the vault (declared or not) whose paper includes `rel`, so
 * the paper map can offer to mark it. The first found, or null.
 */
export async function discoverPaperOf(vault: Vault, rel: string): Promise<string | null> {
  for (const root of await vault.files()) {
    if (!root.toLowerCase().endsWith('.tex') || root === rel) continue
    const text = await readFile(vault.abs(root), 'utf8').catch(() => '')
    if (!isDocument(text) || !parseIncludes(text).length) continue
    const { files } = await paperGraph(vault, root).catch(() => ({ files: [] as PaperFile[] }))
    if (files.some((f) => f.rel === rel && f.exists)) return root
  }
  return null
}

/** The paper rooted at `root`, for the renderer. */
export async function paperInfo(vault: Vault, root: string): Promise<PaperInfo> {
  const { files, texts } = await paperGraph(vault, root)
  return {
    root,
    name: posix.basename(root).replace(/\.tex$/i, ''),
    declared: vault.papers.includes(root),
    files,
    texts: Object.fromEntries(texts),
  }
}

/** Forgets cached graphs (another vault, or a paper's files were rewritten). */
export function clearPaperCache(): void {
  graphs.clear()
}
