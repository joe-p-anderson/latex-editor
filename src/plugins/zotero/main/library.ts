// What the plugin does with the vault's .bib: choose it, add Zotero items to
// it, and refresh the entries it added. Takes the vault as a small interface
// so tests can run it on a temp folder.
import { dirOf, joinRel } from '@shared/project'
import { normalizeEol } from '@shared/search'
import { appendFor, bibNamesIn, scanEntries, upsertEntries, type BibItem, type UpsertResult } from '../bib'
import { missingKey } from '../parse'
import type { EnsureResult, SyncResult } from '../types'
import type { RefProvider } from './provider'

export interface BibFiles {
  /** The file's text, or null when it doesn't exist. */
  read(rel: string): Promise<string | null>
  write(rel: string, text: string): Promise<void>
}

/** The .bib files the document names (existing ones, as vault-relative paths; a missing one is kept as written) and the one to add to. */
export async function chooseBib(files: BibFiles, root: string | null, setting: string): Promise<{ target: string; named: string[] }> {
  const named: string[] = []
  const tex = root ? await files.read(root) : null
  if (root && tex) {
    for (const n of bibNamesIn(tex)) {
      // BibTeX looks next to the document and, failing that, at the vault's top.
      const near = joinRel(dirOf(root), n)
      const found = (await files.read(near)) !== null ? near : (await files.read(joinRel(n))) !== null ? joinRel(n) : near
      if (!named.includes(found)) named.push(found)
    }
  }
  return { target: named.includes(setting) ? setting : (named[0] ?? setting), named }
}

/** Makes sure each wanted reference has an entry in the document's .bib, adding the ones that don't. Throws when a needed Zotero call fails. */
export async function ensureEntries(
  files: BibFiles,
  provider: RefProvider,
  want: { id?: string; key?: string }[],
  root: string | null,
  setting: string,
): Promise<EnsureResult> {
  const { target } = await chooseBib(files, root, setting)
  const text = await files.read(target)
  const present = new Set(scanEntries(text ?? '').map((s) => s.key.toLowerCase()))
  const keys = want.flatMap((w) => (w.key ? [w.key] : []))
  const byKey = await provider.bibtex(keys.filter((k) => !present.has(k.toLowerCase())))
  const ids = want.filter((w) => !w.key && w.id).map((w) => w.id!)
  const items: BibItem[] = [...byKey, ...(await provider.byId(ids))]
  const got = new Set([...keys.filter((k) => present.has(k.toLowerCase())), ...items.map((i) => i.key)])
  const { text: next, results } = upsertEntries(text ?? '', items)
  const added = results.filter((r) => r.status === 'added').map((r) => r.key)
  if (added.length) await files.write(target, next)
  return {
    keys: [...got],
    missing: [...keys, ...ids].filter((k) => !got.has(k) && !items.some((i) => i.id === k)),
    file: target,
    added,
    created: text === null && added.length > 0,
  }
}

/** Refreshes the entries the plugin wrote earlier, in the document's .bib files and the setting's. Hand-written entries are never touched. */
export async function syncEntries(files: BibFiles, provider: RefProvider, root: string | null, setting: string): Promise<SyncResult> {
  const { named } = await chooseBib(files, root, setting)
  const result: SyncResult = { files: [], updated: 0, unchanged: 0, renamed: [], missing: [] }
  for (const file of new Set([...named, setting])) {
    const text = await files.read(file)
    if (text === null) continue
    const marked = scanEntries(text).filter((s) => s.zotero)
    if (!marked.length) continue
    result.files.push(file)
    const items = await provider.byId([...new Set(marked.map((s) => s.zotero!))])
    const found = new Set(items.map((i) => i.id))
    for (const s of marked) if (!found.has(s.zotero!)) result.missing.push(s.key)
    const { text: next, results } = upsertEntries(text, items, { refresh: true, keepKeys: !provider.stableKeys })
    const count = (status: UpsertResult['status']) => results.filter((r) => r.status === status)
    result.updated += count('updated').length
    result.unchanged += count('unchanged').length
    result.renamed.push(...count('renamed').map((r) => r.key))
    if (next !== text) await files.write(file, next)
  }
  return result
}

/** The "Add <key> from Zotero" append for an undefined citation, or null when Zotero doesn't know the key or the entry is there already. */
export async function missingKeyFix(
  files: BibFiles,
  provider: RefProvider,
  problem: { rule: string; title: string },
  root: string,
  setting: string,
): Promise<{ label: string; edits: { file: string; append: string }[] } | null> {
  const key = missingKey(problem)
  if (!key) return null
  const { target } = await chooseBib(files, root, setting)
  // Applying an append to a .bib that doesn't exist yet creates it.
  const text = (await files.read(target)) ?? ''
  const append = appendFor(text, await provider.bibtex([key]))
  return append ? { label: `Add ${key} from Zotero`, edits: [{ file: target, append: normalizeEol(append) }] } : null
}
