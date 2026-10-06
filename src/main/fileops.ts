import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isInside, uniqueName, type Move } from '../shared/paths'
import type { Vault } from './vault'

const exists = (p: string) => stat(p).then(() => true, () => false)

/** Creates `rel` (and its parent folders) holding `text`; fails if it already exists. */
export async function createFile(vault: Vault, rel: string, text: string): Promise<void> {
  const abs = vault.abs(rel)
  await mkdir(dirname(abs), { recursive: true })
  try {
    await writeFile(abs, text, { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`${rel} already exists`)
    throw e
  }
}

export async function createDir(vault: Vault, rel: string): Promise<void> {
  const abs = vault.abs(rel)
  if (await exists(abs)) throw new Error(`${rel} already exists`)
  await mkdir(abs, { recursive: true })
}

async function moveOne(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    // rename can't cross drives: copy, then remove the original.
    await cp(from, to, { recursive: true })
    await rm(from, { recursive: true, force: true })
  }
}

/** Moves files and folders. Every target is checked before anything moves. */
export async function move(vault: Vault, moves: Move[]): Promise<void> {
  const targets = new Set<string>()
  for (const m of moves) {
    const from = vault.abs(m.from)
    const to = vault.abs(m.to)
    if (!(await exists(from))) throw new Error(`${m.from} no longer exists`)
    if (isInside(m.to, m.from)) throw new Error(`Can't move ${m.from} into itself`)
    if (targets.has(m.to) || (await exists(to))) throw new Error(`${m.to} already exists`)
    targets.add(m.to)
  }
  for (const m of moves) await moveOne(vault.abs(m.from), vault.abs(m.to))
}

/** Copies files and folders from anywhere on disk into `dirRel`, renaming clashes to "name (2).ext". Returns the new rels. */
export async function copyIn(vault: Vault, sources: string[], dirRel: string): Promise<string[]> {
  const dir = vault.abs(dirRel)
  await mkdir(dir, { recursive: true })
  const taken = new Set((await readdir(dir)).map((n) => n.toLowerCase()))
  const out: string[] = []
  for (const src of sources) {
    const name = uniqueName(basename(src), (n) => taken.has(n.toLowerCase()))
    taken.add(name.toLowerCase())
    const to = join(dir, name)
    if ((await stat(src)).isDirectory()) await cp(src, to, { recursive: true })
    else await copyFile(src, to)
    out.push(vault.rel(to)!)
  }
  return out
}

// Deleting is a rename into <vault>/.texcache/deleted/<token>/, which is on the
// same drive (so instant), ignored by the watcher, and easy to put back.
const heldDir = (vault: Vault) => join(vault.root, '.texcache', 'deleted')
let tokens = 0

export async function hold(vault: Vault, rels: string[]): Promise<string> {
  const token = `${Date.now().toString(36)}-${tokens++}`
  const dir = join(heldDir(vault), token)
  const done: string[] = []
  try {
    for (const rel of rels) {
      await moveOne(vault.abs(rel), join(dir, rel))
      done.push(rel)
    }
  } catch (e) {
    for (const rel of done.reverse()) await moveOne(join(dir, rel), vault.abs(rel)).catch(() => {})
    await rm(dir, { recursive: true, force: true })
    throw e
  }
  await writeFile(join(dir, '.rels.json'), JSON.stringify(rels)).catch(() => {})
  return token
}

async function heldRels(vault: Vault, token: string): Promise<string[]> {
  return JSON.parse(await readFile(join(heldDir(vault), token, '.rels.json'), 'utf8'))
}

/** Puts a held delete back. Fails, changing nothing, if an original path has been reused. */
export async function restore(vault: Vault, token: string): Promise<string[]> {
  const rels = await heldRels(vault, token)
  for (const rel of rels) if (await exists(vault.abs(rel))) throw new Error(`${rel} already exists`)
  const dir = join(heldDir(vault), token)
  for (const rel of rels) await moveOne(join(dir, rel), vault.abs(rel))
  await rm(dir, { recursive: true, force: true })
  return rels
}

/** Sends a held delete to the OS trash (via `trash`), for good as far as the app is concerned. */
export async function release(vault: Vault, token: string, trash: (abs: string) => Promise<void>): Promise<void> {
  const dir = join(heldDir(vault), token)
  const rels = await heldRels(vault, token).catch(() => [] as string[])
  for (const rel of rels) await trash(join(dir, rel)).catch(() => {})
  await rm(dir, { recursive: true, force: true })
}

/** Releases every delete nobody undid (left over from a previous run or a closed vault). */
export async function releaseAll(vault: Vault, trash: (abs: string) => Promise<void>): Promise<void> {
  for (const token of await readdir(heldDir(vault)).catch(() => [] as string[])) await release(vault, token, trash)
}
