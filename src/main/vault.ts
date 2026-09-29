import { readdir, readFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { TreeNode, VaultInfo } from '../shared/api'

/** Optional per-vault settings, read from <vault>/.vault.json. */
interface VaultSettings {
  /** Template library, absolute or relative to the vault root. */
  templates?: string
}

// Build products and tool folders never shown in the file tree. The editor's
// own outputs (.texcache, pdf) are hidden too; pdf/ is for opening outside
// the app, and the viewer already shows the current document.
const HIDDEN_DIRS = new Set(['.texcache', 'pdf', 'build', '.git', 'node_modules', '.venv', '.vscode'])
const HIDDEN_EXTS = /\.(aux|log|out|synctex\.gz|fls|fdb_latexmk|toc|nav|snm|vrb|bbl|blg|run\.xml)$/i

export class Vault {
  readonly name: string
  templates: string | null = null
  private watcher: FSWatcher | null = null

  constructor(readonly root: string) {
    this.name = basename(root)
  }

  async load(): Promise<void> {
    let settings: VaultSettings = {}
    try {
      settings = JSON.parse(await readFile(join(this.root, '.vault.json'), 'utf8'))
    } catch {
      // No settings file: fine, everything has a default.
    }
    this.templates = settings.templates ? resolve(this.root, settings.templates) : null
  }

  async info(): Promise<VaultInfo> {
    return { root: this.root, name: this.name, templates: this.templates, tree: await this.tree() }
  }

  /** Absolute path for a vault-relative one, refusing anything outside the vault. */
  abs(rel: string): string {
    const p = resolve(this.root, rel)
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error(`Outside vault: ${rel}`)
    return p
  }

  /** Vault-relative, forward-slash path, or null when `abs` is outside the vault. */
  rel(abs: string): string | null {
    const r = relative(this.root, abs)
    if (r.startsWith('..') || isAbsolute(r)) return null
    return r.split(sep).join('/')
  }

  async tree(dir = this.root): Promise<TreeNode[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const nodes: TreeNode[] = []
    for (const e of entries) {
      const abs = join(dir, e.name)
      const rel = this.rel(abs)!
      if (e.isDirectory()) {
        if (HIDDEN_DIRS.has(e.name)) continue
        nodes.push({ name: e.name, rel, kind: 'dir', children: await this.tree(abs) })
      } else if (!HIDDEN_EXTS.test(e.name) && e.name !== '.vault.json') {
        nodes.push({ name: e.name, rel, kind: 'file' })
      }
    }
    // Folders first, then case-insensitive by name, like most file explorers.
    return nodes.sort((a, b) =>
      a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
  }

  /** Calls `onChange` (debounced) when files are added, removed or renamed. */
  watch(onChange: () => void): void {
    let timer: NodeJS.Timeout | undefined
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      ignored: (p) => p.split(sep).some((part) => HIDDEN_DIRS.has(part)),
    })
    this.watcher.on('all', (event) => {
      if (event === 'change') return // content edits don't change the tree
      clearTimeout(timer)
      timer = setTimeout(onChange, 150)
    })
  }

  async close(): Promise<void> {
    await this.watcher?.close()
  }
}
