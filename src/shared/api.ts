import type { AppAppearance, VaultAppearance } from './appearance'
import type { BibSummary } from './bibtex'
import type { CommandSig } from './latexedit'
import type { MacroDefs } from './mathrender'
import type { PaperFile } from './project'
import type { Counters } from './livemodel'
import type { SearchOptions, SearchResult } from './search'
import type { PluginState, SettingValues } from './plugin'

// Types shared by the main process, the preload bridge and the renderer.
// Paths called `rel` are vault-relative with forward slashes; paths called
// `abs` are absolute filesystem paths.

export interface TreeNode {
  name: string
  rel: string
  kind: 'dir' | 'file'
  children?: TreeNode[]
}

export interface VaultInfo {
  root: string
  name: string
  /** Absolute paths of the template libraries, in search order (the vault's own, then the global one). */
  templates: string[]
  /** The per-install template library shared by every vault. */
  globalTemplates: string | null
  /** Vault-relative folder where imported and pasted images go. */
  imagesDir: string
  /** List environment → item command without the backslash, e.g. questions → question. */
  lists: Record<string, string>
  /** Vault-relative path of the user's snippet file (which may not exist yet). */
  snippets: string
  /** Vault-relative path of the math shortcut file (which may not exist yet). */
  mathSnippets: string
  /** Vault-relative path of the spelling word list (which may not exist yet). */
  words: string
  /** The vault's endpaper (palette, marbling, tone, seed), from .vault.json. */
  appearance: VaultAppearance
  tree: TreeNode[]
}

/** A vault opened before, for the welcome screen. */
export interface RecentVault {
  root: string
  name: string
  /** When it was last opened (ms since the epoch). */
  opened: number
  appearance: VaultAppearance
}

export type Severity = 'error' | 'warning' | 'layout'

/**
 * One text change. `find` is located on `line` (1-based) of `file`; when it
 * occurs more than once, the occurrence starting nearest column `near` wins.
 * With `append`, the text is added at the end of the file instead.
 * `replace` may contain \n, which becomes the file's own line break.
 */
export type TextEdit =
  | { file: string; line: number; find: string; replace: string; near?: number }
  | { file: string; append: string }

export interface QuickFix {
  label: string
  edits: TextEdit[]
}

/** A diagnosed log message: what went wrong, in plain words, and how to fix it. */
export interface Problem {
  /** Which rule produced it, e.g. "undefined-command". */
  rule: string
  severity: Severity
  /** Vault-relative when inside the vault, otherwise absolute. */
  file: string | null
  line: number | null
  title: string
  explanation?: string
  fixes: QuickFix[]
  /** Other places involved, e.g. where a mismatched environment was opened. */
  related?: { file: string; line: number; label: string }[]
  /** Probably caused by an earlier error; fixing that one may clear this. */
  followOn?: boolean
  /** Noise (font substitutions, rerun notices): shown only on request. */
  hidden?: boolean
  /** TeX's own words: the log lines this came from. */
  tex: string
}

export interface CompileResult {
  ok: boolean
  /** The document that was compiled (vault-relative). */
  root: string
  passes: number
  /** Absolute path of the PDF in .texcache (the one SyncTeX pairs with). */
  pdf: string | null
  problems: Problem[]
  /** The full log of the last pass, for the raw view. */
  log: string
  durationMs: number
  /** A preview of unsaved buffers: nothing was published to pdf/. */
  draft: boolean
  /** The build started from the cached preamble format. */
  preloaded?: boolean
  /** Just one section of a multi-part paper was built (its name, e.g. §III). */
  section?: string
  /** Why the whole paper was built when only a section was asked for. */
  fullReason?: string
}

/** One section file of a marked paper, to build on its own. */
export interface SectionTarget {
  /** The file the root \inputs (the edited file, or the one it's inside). */
  unit: string
  /** Its starting counters, from the paper model. */
  start: Counters
  /** e.g. §III */
  label: string
}

/** A rectangle on a PDF page, in PDF points from the page's top-left corner. */
export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SyncTarget {
  page: number
  rects: PdfRect[]
}

export interface SourceLocation {
  /** Vault-relative when inside the vault, otherwise absolute (e.g. a template). */
  file: string
  line: number
}

export interface EditorContext {
  /** From the document's own preamble and the vault's classes and packages it loads. */
  commands: CommandSig[]
  environments: string[]
}

/** A document's bibliography, for the cite picker, completion and live view. */
export interface BibInfo {
  /** The .bib files the document uses, vault-relative (those found). */
  bibs: string[]
  /** Names in \bibliography{…} that match no file. */
  missing: string[]
  entries: BibSummary[]
  /** Key → the label the document prints for it (from the last build's .aux). */
  labels: Record<string, string>
}

/** The paper a file belongs to: its root and every file it pulls in, in reading order. */
export interface PaperInfo {
  root: string
  /** Its display name: the root's file name, without .tex. */
  name: string
  /** Marked as a multi-part paper (in .vault.json). */
  declared: boolean
  /** Root first, then each included file depth first. */
  files: PaperFile[]
  /** Each readable file's saved text. */
  texts: Record<string, string>
}

export type TouchpadEvent = { type: 'contact'; id: number; tip: boolean; x: number; y: number } | { type: 'button'; down: boolean }

export interface Api {
  openVault(): Promise<VaultInfo | null>
  getVault(): Promise<VaultInfo | null>
  /** Vaults opened before that still exist, most recent first. */
  recentVaults(): Promise<RecentVault[]>
  openVaultAt(root: string): Promise<VaultInfo>
  /** Picks or makes a folder and opens it as a new vault; null if cancelled. */
  newVault(): Promise<VaultInfo | null>
  /** Closes the vault, back to the welcome screen. */
  closeVault(): Promise<void>
  readFile(rel: string): Promise<string>
  /** Like readFile, but null when the file doesn't exist. */
  readOptional(rel: string): Promise<string | null>
  /** The snippet files in the app's data folder, null where missing. */
  globalSnippets(): Promise<{ snippets: string | null; mathSnippets: string | null }>
  writeFile(rel: string, text: string): Promise<void>
  /** Renames a vault file; fails if `to` exists. */
  renameFile(from: string, to: string): Promise<void>
  /** Sends a vault file to the Recycle Bin. */
  trashFile(rel: string): Promise<void>
  compile(rel: string): Promise<CompileResult>
  /** A preview build of `rel` with unsaved `buffers` in place of the files on disk; null if it isn't part of a document. */
  compileDraft(rel: string, buffers: Record<string, string>): Promise<CompileResult | null>
  readPdf(abs: string): Promise<Uint8Array>
  /** Source line → where it appears in `pdf`. */
  syncForward(pdf: string, rel: string, line: number): Promise<SyncTarget | null>
  /** Point on a PDF page → the source line that produced it. */
  syncInverse(pdf: string, page: number, x: number, y: number): Promise<SourceLocation | null>
  /** Macros (MathJax format) for previewing math in `rel`, and the files they came from. */
  mathMacros(rel: string): Promise<{ macros: MacroDefs; sources: string[] }>
  /** Commands (with argument counts) and environments the document `rel` defines, for completion. */
  editorContext(rel: string): Promise<EditorContext>
  /** The bibliography of the document `rel` belongs to. */
  bibInfo(rel: string): Promise<BibInfo>
  /**
   * The paper `rel` belongs to (its root, which may be `rel` itself); null when there's no document.
   * `overrides` (unsaved buffers) are read in place of the files, so an \input not yet saved counts.
   */
  paperInfo(rel: string, overrides?: Record<string, string>): Promise<PaperInfo | null>
  /** Marks `root` as a multi-part paper, or unmarks it, in .vault.json. */
  declarePaper(root: string, on: boolean): Promise<void>
  /**
   * Builds just the section `rel` is in (a file of a marked paper). Saving
   * (`saving`) builds the whole paper instead when the section alone can't
   * be trusted (fullBuildReason); a preview builds the section unless there's
   * no full build yet. Falls back to a full build when a section can't be made.
   */
  compileSection(rel: string, buffers: Record<string, string>, target: SectionTarget, saving: boolean): Promise<CompileResult | null>
  /** Every image in the vault, vault-relative. */
  listImages(): Promise<string[]>
  /** Copies an image from outside the vault into its image folder (or returns its path if inside). */
  importImage(sourcePath: string): Promise<string>
  /** Saves image bytes (a pasted screenshot) into the image folder. */
  saveImage(name: string, bytes: Uint8Array): Promise<string>
  /** Moves a vault file into the global template library; its new absolute path, or null if cancelled. */
  moveToGlobalTemplates(rel: string): Promise<string | null>
  /** Filesystem path of a dropped File, or '' if it has none. */
  pathForFile(file: File): string
  /** The words (of `words`) that are misspelled, by the en-US dictionary plus the vault's word list. */
  spellCheck(words: string[]): Promise<string[]>
  /** Up to six suggested spellings. */
  spellSuggest(word: string): Promise<string[]>
  /** Adds a word to the vault's word list. */
  addWord(word: string): Promise<void>
  /** Re-reads the vault's word list (after it was edited). */
  reloadWords(): Promise<void>
  /** Keeps the View → Check Spelling tick in step. */
  setSpellcheckMenu(on: boolean): Promise<void>
  /** Opens a credit link (Detexify's sites only) in the browser. */
  openExternal(url: string): Promise<void>
  /** Starts reading finger positions from the trackpad (Windows Precision Touchpad), with its aspect ratio. */
  touchpadStart(): Promise<{ ok: true; aspect: number } | { ok: false; error: string }>
  touchpadStop(): Promise<void>
  /** A finger (x, y from 0 to 1 across the pad; tip: whether it touches), or the pad's physical button. */
  onTouchpad(cb: (e: TouchpadEvent) => void): () => void
  /** A menu item for the renderer: 'math-shortcuts', or 'spellcheck' with whether it's now on. */
  onMenu(cb: (name: string, arg?: unknown) => void): () => void
  /** Searches the vault's text files; `overrides` (unsaved buffers) are searched instead of the disk copies. */
  search(query: string, opts: SearchOptions, overrides: Record<string, string>): Promise<SearchResult>
  /** Asks whether to save the unsaved `files` before `action` (e.g. "closing"). */
  askAboutUnsaved(files: string[], action: string): Promise<'save' | 'discard' | 'cancel'>
  /** Closes the window for real (after unsaved files were dealt with). */
  closeWindow(): Promise<void>
  /** The user asked to close the window; the renderer decides, then calls closeWindow. */
  onCloseRequested(cb: () => void): () => void
  onTreeChanged(cb: (tree: TreeNode[]) => void): () => void
  /** The global appearance (look, page, type), from settings.json. */
  getAppearance(): Promise<AppAppearance>
  /** Saves changes to the global appearance; returns the whole of it. */
  setAppearance(changes: Partial<AppAppearance>): Promise<AppAppearance>
  /** Saves changes to the open vault's endpaper in its .vault.json; returns the whole of it. */
  setVaultAppearance(changes: Partial<VaultAppearance>): Promise<VaultAppearance>
  /** Colours the window controls Windows draws over the title bar. */
  setWindowChrome(color: string, symbolColor: string): Promise<void>
  /** Opens one of the app's menus (File, Edit, View, Build) at a point in the window. */
  popupMenu(label: string, x: number, y: number): Promise<void>
  /** Shows a right-click menu at the pointer; the id of the item chosen, or null if it was dismissed. */
  contextMenu(items: { id: string; label: string; enabled?: boolean; separator?: boolean }[]): Promise<string | null>
  /** A cached marbled sheet (JPEG), or null if it hasn't been rendered yet. */
  marbleGet(key: string): Promise<Uint8Array | null>
  marblePut(key: string, bytes: Uint8Array): Promise<void>
  /** The git branch the vault is on, or null if it isn't in a repository. */
  gitBranch(): Promise<string | null>
  /** The vault's settings changed (e.g. a new global template folder). */
  onVaultChanged(cb: (vault: VaultInfo) => void): () => void
  /** Every plugin, and whether it's on for the open vault (src/shared/plugin.ts). */
  plugins(): Promise<PluginState[]>
  /**
   * Switches a plugin for this vault (`vaultEnabled`; null follows the default)
   * or for new vaults (`defaultEnabled`), or changes its settings. Returns every plugin's state.
   */
  changePlugin(
    id: string,
    change: { vaultEnabled?: boolean | null; defaultEnabled?: boolean; vaultSettings?: SettingValues; globalSettings?: SettingValues },
  ): Promise<PluginState[]>
  /** Calls a handler a plugin's main half registered with ctx.handle. */
  pluginInvoke(id: string, name: string, args: unknown[]): Promise<unknown>
  /** Opens one of the plugin's manifest `links` in the browser. */
  pluginOpenLink(id: string, url: string): Promise<void>
  /** The plugin commands to list in the Tools menu. */
  setPluginMenu(commands: { id: string; title: string; plugin: string; key?: string }[]): Promise<void>
  /** Plugins were switched or their settings changed. */
  onPluginsChanged(cb: (states: PluginState[]) => void): () => void
  /** A plugin's main half sent its renderer half an event (ctx.emit). */
  onPluginEvent(cb: (id: string, event: string, data: unknown) => void): () => void
}
