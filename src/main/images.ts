// Bringing images into the vault: files dragged in from elsewhere are copied
// into the vault's image folder, and pasted screenshots are saved there.
// Names are made LaTeX-safe, and an identical file already there is reused
// rather than duplicated.
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, posix } from 'node:path'
import { isImage, safeFileName } from '../shared/images'
import type { Vault } from './vault'

/** Vault-relative path of the image at `source`, copying it in if it's outside the vault. */
export async function importImage(vault: Vault, source: string): Promise<string> {
  if (!isImage(source)) throw new Error(`Not an image: ${basename(source)}`)
  const inside = vault.rel(source)
  if (inside) return inside
  const bytes = await readFile(source)
  return place(vault, safeFileName(basename(source)), bytes, (dest) => copyFile(source, dest))
}

/** Saves image bytes (e.g. a pasted screenshot) into the image folder. */
export async function saveImage(vault: Vault, name: string, bytes: Uint8Array): Promise<string> {
  const safe = safeFileName(name)
  if (!isImage(safe)) throw new Error(`Not an image: ${name}`)
  return place(vault, safe, bytes, (dest) => writeFile(dest, bytes))
}

/**
 * Finds a free name for `name` in the image folder: name.png, name-1.png, ...
 * If a file with that name already holds the same bytes, reuses it.
 */
async function place(vault: Vault, name: string, bytes: Uint8Array, write: (dest: string) => Promise<void>): Promise<string> {
  const dirRel = vault.imagesDir
  await mkdir(vault.abs(dirRel), { recursive: true })
  const dot = name.lastIndexOf('.')
  const stem = name.slice(0, dot)
  const ext = name.slice(dot)
  for (let n = 0; n < 1000; n++) {
    const rel = posix.join(dirRel, n ? `${stem}-${n}${ext}` : name)
    const dest = vault.abs(rel)
    const existing = await stat(dest).catch(() => null)
    if (!existing) {
      await write(dest)
      return rel
    }
    if (existing.size === bytes.length && Buffer.compare(await readFile(dest), Buffer.from(bytes)) === 0) return rel
  }
  throw new Error(`No free name for ${name} in ${dirRel}`)
}

