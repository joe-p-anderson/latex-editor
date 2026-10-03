// Optional: keeping a Zotero collection equal to what the document cites.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { citedKeysFromAux, keysChanged } from '../parse'
import type { Zotero } from './provider'

export type CollectionSync = 'synced' | 'unchanged' | 'no-bbt' | 'no-aux'

/**
 * Fills the collection `path` from the build's .aux through Better BibTeX's
 * scanAUX (it clears the collection first). Does nothing unless the set of
 * cited keys differs from the last successful sync, which is remembered in
 * `cacheDir`. Throws when Zotero refuses, and then remembers nothing, so the
 * next build tries again.
 */
export async function syncCollection(o: { zot: Zotero; collection: string; auxPath: string; cacheDir: string }): Promise<CollectionSync> {
  if (!(await o.zot.status(15_000)).bbt) return 'no-bbt'
  const aux = await readFile(o.auxPath, 'utf8').catch(() => null)
  if (aux == null) return 'no-aux'
  const keys = citedKeysFromAux(aux)
  const stateFile = join(o.cacheDir, 'collection.json')
  let before: { collection: string; keys: string[] } | null = null
  try {
    before = JSON.parse(await readFile(stateFile, 'utf8'))
  } catch {
    // never synced
  }
  if (before?.collection === o.collection && !keysChanged(before.keys, keys)) return 'unchanged'
  // Better BibTeX wants an absolute path, from the library: /My Library/endleaf/….
  const path = o.collection.startsWith('/') ? o.collection : `/${await o.zot.libraryName()}/${o.collection}`
  await o.zot.rpc('collection.scanAUX', [path, o.auxPath])
  await mkdir(o.cacheDir, { recursive: true })
  await writeFile(stateFile, JSON.stringify({ collection: o.collection, keys }))
  return 'synced'
}
