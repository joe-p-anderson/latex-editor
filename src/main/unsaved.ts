// A copy of each vault's unsaved buffers on disk, so a window that reloads
// or crashes (the dev server reconnecting after sleep does a full reload)
// can put them back. One file per vault in <userData>/unsaved/, named by a
// hash of the vault's root; no unsaved buffers means no file.

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface Backup {
  root: string
  savedAt: string
  /** Unsaved text by vault-relative path. */
  buffers: Record<string, string>
}

export class UnsavedStore {
  // Writes for one vault run in order, so an older copy never lands last.
  private queue = new Map<string, Promise<void>>()

  constructor(private readonly dir: string) {}

  private fileFor(root: string): string {
    const key = createHash('sha1').update(root.toLowerCase()).digest('hex').slice(0, 16)
    return join(this.dir, `${key}.json`)
  }

  /** Replaces `root`'s copy with `buffers`; an empty `buffers` removes it. */
  write(root: string, buffers: Record<string, string>): Promise<void> {
    const file = this.fileFor(root)
    const next = (this.queue.get(file) ?? Promise.resolve()).then(async () => {
      if (!Object.keys(buffers).length) {
        await unlink(file).catch(() => {})
        return
      }
      await mkdir(this.dir, { recursive: true })
      const backup: Backup = { root, savedAt: new Date().toISOString(), buffers }
      const tmp = `${file}.tmp`
      await writeFile(tmp, JSON.stringify(backup), 'utf8')
      await rename(tmp, file)
    })
    const settled = next.catch(() => {})
    this.queue.set(file, settled)
    void settled.then(() => this.queue.get(file) === settled && this.queue.delete(file))
    return next
  }

  /** `root`'s unsaved buffers from the copy, or {} if there is none. */
  async read(root: string): Promise<Record<string, string>> {
    const file = this.fileFor(root)
    await this.queue.get(file)
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text == null) return {}
    try {
      const backup = JSON.parse(text) as Backup
      return backup.root.toLowerCase() === root.toLowerCase() && backup.buffers ? backup.buffers : {}
    } catch {
      return {}
    }
  }
}
