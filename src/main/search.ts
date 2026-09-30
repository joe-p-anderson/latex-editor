// Searches every text file in the vault. Unsaved editor buffers are passed
// in and searched instead of the copies on disk.
import { readFile, stat } from 'node:fs/promises'
import { compileQuery, searchText, SEARCHABLE, type FileMatches, type SearchOptions, type SearchResult } from '../shared/search'
import type { Vault } from './vault'

const MAX_MATCHES = 5000
const MAX_FILE_BYTES = 4 * 1024 * 1024

export async function searchVault(vault: Vault, query: string, opts: SearchOptions, overrides: Record<string, string>): Promise<SearchResult> {
  const re = compileQuery(query, opts)
  if (typeof re === 'string') return { files: [], truncated: false, error: query ? re : undefined }

  const rels = [...new Set([...(await vault.files()).filter((f) => SEARCHABLE.test(f)), ...Object.keys(overrides)])]
  rels.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
  const texts = await Promise.all(
    rels.map(async (rel) => {
      if (rel in overrides) return overrides[rel]
      const abs = vault.abs(rel)
      if (((await stat(abs).catch(() => null))?.size ?? Infinity) > MAX_FILE_BYTES) return null
      return readFile(abs, 'utf8').catch(() => null)
    }),
  )

  const files: FileMatches[] = []
  let left = MAX_MATCHES
  for (const [i, rel] of rels.entries()) {
    const text = texts[i]
    if (text == null) continue
    const matches = searchText(text, re, opts, left + 1)
    if (!matches.length) continue
    files.push({ rel, matches: matches.slice(0, left) })
    left -= matches.length
    if (left < 0) return { files, truncated: true }
  }
  return { files, truncated: false }
}
