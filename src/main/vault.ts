import { realpathSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { TreeNode, VaultInfo } from '../shared/api'
import { DEFAULT_LISTS } from '../shared/latexedit'
import { normalizeVaultAppearance, type VaultAppearance } from '../shared/appearance'
import type { SettingValues, VaultPluginEntry } from '../shared/plugin'

/**
 * `dir` with Windows 8.3 short names (C:\Users\JANDER~1) expanded, or `dir`
 * itself if it can't be resolved. TeX reads `~` as its tie character, so a
 * short-form path that reaches TeX's command line (preview and section builds
 * name files by their full path) stops the build before it starts.
 */
export function longPath(dir: string): string {
  try {
    return realpathSync.native(resolve(dir))
  } catch {
    return dir
  }
}

/** Optional per-vault settings, read from <vault>/.vault.json. */
interface VaultSettings {
  /** The vault's name in the app; the folder's name when unset. */
  name?: string
  /** A vault-only template library, absolute or relative to the vault root; searched before the global one. */
  templates?: string
  /** Folder (vault-relative) where imported and pasted images go. */
  images?: string
  /** Extra list environments and their item command, e.g. { "questions": "\\question" }. */
  lists?: Record<string, string>
  /** The snippet file, vault-relative. */
  snippets?: string
  /** Preload the preamble from a cached format (default true). */
  fastCompile?: boolean
  /** The math shortcut file, vault-relative. */
  mathSnippets?: string
  /** The spelling word list, vault-relative. */
  words?: string
  /** The vault's endpaper: palette, marbling, tone and seed. */
  appearance?: Partial<VaultAppearance>
  /** Root documents marked as multi-part papers, vault-relative. */
  papers?: string[]
  /** Plugins on or off in this vault, and their vault settings (src/shared/plugin.ts). */
  plugins?: Record<string, VaultPluginEntry>
  /** The starter New file preselects here, by name; the app-wide default when unset. */
  defaultStarter?: string
}

// Where images go when none is configured: the first of these that exists.
const IMAGE_DIR_CANDIDATES = ['Images', 'images', 'Assets', 'assets', 'figures', 'Figures']

// Build products and tool folders never shown in the file tree. The editor's
// own outputs (.texcache, pdf) are hidden too; pdf/ is for opening outside
// the app, and the viewer already shows the current document.
const HIDDEN_DIRS = new Set(['.texcache', 'pdf', 'build', '.git', 'node_modules', '.venv', '.vscode'])
const HIDDEN_EXTS = /\.(aux|log|out|synctex\.gz|fls|fdb_latexmk|toc|nav|snm|vrb|bbl|blg|run\.xml)$/i

export class Vault {
  /** The name shown in the app: .vault.json's, else the folder's. */
  name: string
  /** The vault's own template library (from .vault.json), if any. */
  vaultTemplates: string | null = null
  /** Vault-relative folder for imported and pasted images. */
  imagesDir = 'Images'
  /** List environment → item command (no backslash), for Enter in the editor. */
  lists: Record<string, string> = { ...DEFAULT_LISTS }
  /** Vault-relative snippet file (it need not exist). */
  snippets = 'snippets.txt'
  /** Whether builds may start from a cached preamble format. */
  fastCompile = true
  /** Vault-relative math shortcut file (it need not exist). */
  mathSnippets = 'math-snippets.txt'
  /** Vault-relative spelling word list (it need not exist). */
  words = 'words.txt'
  /** The vault's endpaper. */
  appearance: VaultAppearance
  /** Root documents marked as multi-part papers. */
  papers: string[] = []
  /** Plugin entries from .vault.json. */
  plugins: Record<string, VaultPluginEntry> = {}
  /** The starter New file preselects here, by name, or null for the app-wide default. */
  defaultStarter: string | null = null
  private watcher: FSWatcher | null = null
  /** Called with each file added, changed or removed (vault-relative), for plugins. */
  private fileListeners = new Set<(event: 'add' | 'change' | 'unlink', rel: string) => void>()

  /** The vault's folder, in its long form (see longPath). */
  readonly root: string

  /** `globalTemplates` is the per-install template library shared by every vault. */
  constructor(
    root: string,
    public globalTemplates: string | null = null,
  ) {
    this.root = longPath(root)
    this.name = basename(this.root)
    this.appearance = normalizeVaultAppearance(undefined, this.folderName)
  }

  /** The folder's own name. It seeds the default endpaper, so naming the vault doesn't remarble it. */
  get folderName(): string {
    return basename(this.root)
  }

  /** Template libraries in search order: the vault's own, then the global one. */
  get templateDirs(): string[] {
    const dirs = [this.vaultTemplates, this.globalTemplates].filter((d): d is string => !!d)
    return [...new Set(dirs)]
  }

  private get settingsPath(): string {
    return join(this.root, '.vault.json')
  }

  private settingsQueue: Promise<unknown> = Promise.resolve()

  /**
   * Reads .vault.json, lets `change` edit it, and writes it back, one change
   * at a time: two at once would both read the file before either wrote, and
   * the second write would drop the first one's change.
   */
  private updateSettings<T>(change: (settings: VaultSettings) => T): Promise<T> {
    const next = this.settingsQueue.then(async () => {
      const settings = await this.readSettings()
      const result = change(settings)
      await writeFile(this.settingsPath, JSON.stringify(settings, null, 2) + '\n')
      return result
    })
    this.settingsQueue = next.catch(() => {})
    return next
  }

  private async readSettings(): Promise<VaultSettings> {
    try {
      return JSON.parse(await readFile(this.settingsPath, 'utf8'))
    } catch {
      // No settings file: fine, everything has a default.
      return {}
    }
  }

  async load(): Promise<void> {
    const settings = await this.readSettings()
    this.name = (typeof settings.name === 'string' && settings.name.trim()) || this.folderName
    this.vaultTemplates = settings.templates ? resolve(this.root, settings.templates) : null
    this.imagesDir = settings.images ?? (await this.firstExistingDir(IMAGE_DIR_CANDIDATES)) ?? 'Images'
    this.lists = { ...DEFAULT_LISTS }
    for (const [env, marker] of Object.entries(settings.lists ?? {})) {
      const name = typeof marker === 'string' ? marker.trim().replace(/^\\/, '') : ''
      if (name) this.lists[env] = name
    }
    this.snippets = settings.snippets ?? 'snippets.txt'
    this.fastCompile = settings.fastCompile !== false
    this.mathSnippets = settings.mathSnippets ?? 'math-snippets.txt'
    this.words = settings.words ?? 'words.txt'
    this.appearance = normalizeVaultAppearance(settings.appearance, this.folderName)
    this.papers = Array.isArray(settings.papers) ? settings.papers.filter((p) => typeof p === 'string') : []
    this.plugins = settings.plugins && typeof settings.plugins === 'object' ? settings.plugins : {}
    this.defaultStarter = (typeof settings.defaultStarter === 'string' && settings.defaultStarter.trim()) || null
  }

  /** Sets the starter New file preselects in this vault (null goes back to the app-wide default), in .vault.json. */
  saveDefaultStarter(name: string | null): Promise<void> {
    return this.updateSettings((settings) => {
      const trimmed = name?.trim() || null
      if (trimmed) settings.defaultStarter = trimmed
      else delete settings.defaultStarter
      this.defaultStarter = trimmed
    })
  }

  /**
   * Sets a plugin on or off here (`enabled`; null follows the default) and/or
   * merges `settings` into its vault settings, in .vault.json.
   */
  savePlugin(id: string, change: { enabled?: boolean | null; settings?: SettingValues }): Promise<void> {
    return this.updateSettings((settings) => {
      const old = this.plugins[id]
      const entry: { enabled?: boolean; settings?: SettingValues } = typeof old === 'object' && old ? { ...old } : typeof old === 'boolean' ? { enabled: old } : {}
      if (change.enabled === null) delete entry.enabled
      else if (change.enabled !== undefined) entry.enabled = change.enabled
      if (change.settings) entry.settings = { ...entry.settings, ...change.settings }
      const plugins = { ...this.plugins }
      // A bare on/off reads best as true/false in the file.
      if (entry.settings && Object.keys(entry.settings).length) plugins[id] = entry
      else if (entry.enabled !== undefined) plugins[id] = entry.enabled
      else delete plugins[id]
      this.plugins = plugins
      settings.plugins = plugins
    })
  }

  /** Calls `f` with each file added, changed or removed in the vault (not in hidden folders). */
  onFile(f: (event: 'add' | 'change' | 'unlink', rel: string) => void): () => void {
    this.fileListeners.add(f)
    return () => this.fileListeners.delete(f)
  }

  /**
   * Merges `changes` into the vault's endpaper and writes it to .vault.json,
   * keeping the file's other settings. Returns the result.
   */
  saveAppearance(changes: Partial<VaultAppearance>): Promise<VaultAppearance> {
    return this.updateSettings((settings) => {
      this.appearance = normalizeVaultAppearance({ ...this.appearance, ...changes }, this.folderName)
      settings.appearance = this.appearance
      return this.appearance
    })
  }

  /** Names the vault in .vault.json (blank goes back to the folder's name), keeping its other settings. Returns the name. */
  saveName(name: string): Promise<string> {
    return this.updateSettings((settings) => {
      const trimmed = name.trim()
      if (trimmed && trimmed !== this.folderName) settings.name = trimmed
      else delete settings.name
      this.name = trimmed || this.folderName
      return this.name
    })
  }

  /** Marks `root` as a multi-part paper (or not) in .vault.json, keeping its other settings. */
  savePaper(root: string, on: boolean): Promise<void> {
    return this.updateSettings((settings) => {
      const papers = this.papers.filter((p) => p !== root)
      if (on) papers.push(root)
      this.papers = papers
      settings.papers = papers
    })
  }

  private async firstExistingDir(names: string[]): Promise<string | null> {
    for (const n of names) {
      if ((await stat(join(this.root, n)).catch(() => null))?.isDirectory()) return n
    }
    return null
  }

  async info(): Promise<VaultInfo> {
    return {
      root: this.root,
      name: this.name,
      templates: this.templateDirs,
      globalTemplates: this.globalTemplates,
      imagesDir: this.imagesDir,
      lists: this.lists,
      snippets: this.snippets,
      mathSnippets: this.mathSnippets,
      words: this.words,
      appearance: this.appearance,
      tree: await this.tree(),
    }
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

  /** Every visible file in the vault, vault-relative. */
  async files(): Promise<string[]> {
    const out: string[] = []
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) n.kind === 'dir' ? walk(n.children ?? []) : out.push(n.rel)
    }
    walk(await this.tree())
    return out
  }

  /** Calls `onChange` (debounced) when files are added, removed or renamed. */
  watch(onChange: () => void): void {
    let timer: NodeJS.Timeout | undefined
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      ignored: (p) => p.split(sep).some((part) => HIDDEN_DIRS.has(part)),
    })
    this.watcher.on('all', (event, path) => {
      if (event === 'add' || event === 'change' || event === 'unlink') {
        const rel = this.rel(resolve(this.root, path))
        if (rel) for (const f of this.fileListeners) f(event, rel)
      }
      if (event === 'change') return // content edits don't change the tree
      clearTimeout(timer)
      timer = setTimeout(onChange, 150)
    })
  }

  async close(): Promise<void> {
    await this.watcher?.close()
  }
}
