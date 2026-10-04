// The renderer half of the plugin engine (docs/design/PLUGINS.md). It
// starts and stops each plugin's renderer half as plugins are switched, and
// collects what they add: sidebar views, commands, status bar items, editor
// extensions, live-view decorations and citation sources. App.svelte reads
// those lists and supplies the HostServices plugins act through.
import type { Component } from 'svelte'
import { StateEffect, type Extension, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { VaultInfo } from '@shared/api'
import type { MacroDefs } from '@shared/mathrender'
import type { PackageSpec } from '@shared/packages'
import { whenHolds, type PluginManifest, type PluginState, type SettingValues } from '@shared/plugin'
import { RENDERER } from '../../../plugins/renderer'
import { isLive, liveFile, setLive } from './live/live'
import type { RenderFn } from './mathPreview'

/** What the open editor can do for a plugin. Offsets count a line break as one character. */
export interface EditorActions {
  /** The open file, vault-relative, or null. */
  file(): string | null
  /** Its current text, saved or not. */
  text(): string
  cursor(): number
  selection(): { from: number; to: number; text: string }
  /** Inserts at the cursor, replacing any selection. */
  insert(text: string): void
  /** Puts `text` at the cursor on lines of its own. */
  insertBlock(text: string): void
  /** Replaces `from`–`to` as one undoable change. */
  replace(from: number, to: number, text: string): void
  /** Changes another file (opening it in the background), left unsaved. */
  applyTo(rel: string, changes: { from: number; to: number; insert: string }[]): Promise<void>
  /** A file's current text: the editor's if open, else the disk's. */
  textOf(rel: string): Promise<string>
  focus(): void
  /** Renders TeX math with the open document's macros. */
  math(): RenderFn
}

/** What App.svelte provides for plugins to act through. */
export interface HostServices {
  vault(): VaultInfo | null
  /** Every visible vault file, vault-relative. */
  files(): string[]
  editor: EditorActions
  /** The root document of the open file (itself, or the paper it's part of). */
  root(): Promise<string | null>
  /** The open document's math macros (MathJax form). */
  macros(): Promise<MacroDefs>
  packages: {
    /** Adds the \usepackage lines the open document doesn't have yet (itself or via its class). */
    ensure(pkgs: PackageSpec[]): Promise<void>
    /** Which of `pkgs` it doesn't load yet; null with no document. */
    missing(pkgs: PackageSpec[]): Promise<PackageSpec[] | null>
    /** What it loads (its own lines and, from the last build's log, its class's). */
    loaded(): Promise<{ packages: Set<string>; encodings: Set<string> } | null>
  }
  /** A short message in the header. */
  notify(text: string): void
  /** Opens a file (at a line). */
  open(rel: string, line?: number): Promise<void>
  /** Asks for a line of text; null when cancelled. */
  prompt(opts: { title: string; initial?: string; hint?: string }): Promise<string | null>
  /** Cites `keys` at the cursor (into the \cite it's in, or a new one). */
  cite(keys: string[]): void
  /** Re-reads the open document's bibliography (after a plugin wrote to a .bib). */
  reloadBib(): void
  /** Shows a sidebar view. */
  showView(id: string): void
  /** Shows the Plugins view with one plugin's settings (and its panel) unfolded. */
  showPlugin(id: string): void
}

/** Props every plugin view component gets. */
export interface PluginViewProps {
  ctx: RendererContext
  /** Whether the view is showing (the sidebar is open on it). */
  visible: boolean
  /** Changes whenever the open file, its build, or the vault's files change. */
  docKey: string
}

export interface PluginView {
  /** `<plugin>:<id>`, unique across plugins. */
  id: string
  plugin: string
  icon: string
  tip: string
  component: Component<PluginViewProps>
  /** Shown under "tools", and only when the manifest's `when` holds. */
  contextual: boolean
  ctx: RendererContext
}

export interface PluginCommand {
  /** `<plugin>:<id>`. */
  id: string
  title: string
  /** The plugin's name, for grouping in the Tools menu. */
  plugin: string
  /** A CodeMirror key, e.g. "Mod-Alt-q" (works while the editor has focus). */
  key?: string
  run(): void | Promise<void>
}

export interface StatusItem {
  id: number
  plugin: string
  text: string
  tip?: string
  onclick?: () => void
}

/** One result of a citation source's search. */
export interface CiteHit {
  /** Its citation key, when known before it's picked. */
  key?: string
  title: string
  authors: string
  year?: string
  /** e.g. the journal. */
  detail?: string
  /** Already in the document's bibliography (picking it just cites it). */
  inBib?: boolean
}

/**
 * Somewhere other than the vault's .bib files to find references (e.g.
 * Zotero). Its hits show dimmed in the cite picker, below the document's own
 * entries; inserting one adds it to the bibliography first.
 */
export interface CiteSource {
  plugin: string
  /** Its name in the cite picker ("From Zotero"). */
  label: string
  search(query: string): Promise<CiteHit[]>
  /**
   * Makes the hit citable by writing it into the document's .bib. Returns its
   * key, and `file` when this call wrote it there (absent when it was there
   * already); null when it couldn't (say why with notify).
   */
  add(hit: CiteHit): Promise<{ key: string; file?: string } | null>
  /** Takes back an `add`: removes `key`'s entry from `file`. */
  remove(key: string, file: string): Promise<void>
}

/** What a plugin's renderer half gets. Everything it adds is removed when it's switched off. */
export interface RendererContext {
  readonly id: string
  readonly manifest: PluginManifest
  readonly host: HostServices
  readonly editor: EditorActions & {
    /** A CodeMirror extension in every open editor. */
    extension(ext: Extension): void
  }
  readonly settings: {
    global(): SettingValues
    vault(): SettingValues
    setGlobal(values: SettingValues): Promise<void>
    setVault(values: SettingValues): Promise<void>
  }
  /** Calls a handler its main half registered with ctx.handle. */
  invoke<T = unknown>(name: string, ...args: unknown[]): Promise<T>
  /** An event its main half sent with ctx.emit. */
  on(event: string, cb: (data: unknown) => void): void
  views: {
    add(v: { id: string; tip: string; component: Component<PluginViewProps>; icon?: string; contextual?: boolean }): void
  }
  commands: {
    add(c: { id: string; title: string; run: () => void | Promise<void>; key?: string }): void
    /** Runs a command by its id (its own, or another plugin's `<plugin>:<id>`). */
    run(id: string): void
  }
  status: {
    /** A status bar item; change it with the returned `set`. */
    item(i: { text: string; tip?: string; onclick?: () => void }): { set(i: Partial<{ text: string; tip: string; onclick: () => void }>): void }
  }
  live: {
    /**
     * Decorations shown only in the live view, recomputed when the text or
     * the visible range changes, and when `refresh` is called (after what
     * `fn` reads changes, e.g. the plugin's index). `file` is the editor's file.
     */
    decorations(fn: (state: EditorState, file: string | null) => Range<Decoration>[]): { refresh(): void }
  }
  cite: {
    source(s: Omit<CiteSource, 'plugin'>): void
  }
  /** Extra content under the plugin's entry in the Plugins panel (e.g. a setup checklist), while it's on. */
  panel(component: Component<{ ctx: RendererContext }>): void
  /** Opens the Plugins view on this plugin, its settings and panel unfolded. */
  showSettings(): void
  /** Opens one of the manifest's `links` in the browser. */
  openLink(url: string): Promise<void>
  onDispose(f: () => void): void
}

export type PluginRenderer = (ctx: RendererContext) => void | Promise<void>

interface Running {
  disposers: (() => void)[]
  events: Map<string, Set<(data: unknown) => void>>
}

export class PluginRuntime {
  // Raw state: entries are replaced, never mutated, and must keep their identity
  // (a deep proxy would wrap each one, so removing an entry by identity would fail).
  states = $state.raw<PluginState[]>([])
  views = $state.raw<PluginView[]>([])
  commands = $state.raw<PluginCommand[]>([])
  status = $state.raw<StatusItem[]>([])
  citeSources = $state.raw<CiteSource[]>([])
  /** Plugins' own content for the Plugins panel, by plugin id. */
  panels = $state.raw<{ plugin: string; component: Component<{ ctx: RendererContext }>; ctx: RendererContext }[]>([])
  /** Every plugin's editor extensions (and the command keys), for Editor.svelte. */
  extensions = $state.raw<Extension[]>([])

  private running = new Map<string, Running>()
  private editorExts = new Map<string, Extension[]>()
  private statusSeq = 0

  constructor(private readonly host: HostServices) {
    window.api.onPluginEvent((id, event, data) => {
      for (const cb of this.running.get(id)?.events.get(event) ?? []) cb(data)
    })
  }

  /** Reads the plugins' states and starts or stops renderer halves to match. */
  async load(): Promise<void> {
    await this.apply(await window.api.plugins())
  }

  /** Brings the running plugins in line with `states`. */
  async apply(states: PluginState[]): Promise<void> {
    this.states = states
    const vault = !!this.host.vault()
    for (const s of states) {
      const id = s.manifest.id
      const on = vault && s.enabled
      if (on && !this.running.has(id)) await this.start(s)
      else if (!on && this.running.has(id)) this.stop(id)
    }
    this.publishMenu()
  }

  /** Stops every plugin (the vault closed). */
  stopAll(): void {
    for (const id of [...this.running.keys()]) this.stop(id)
    this.publishMenu()
  }

  /** The views to show in the activity bar now: always-on ones, and contextual ones whose `when` holds. */
  visibleViews(active: string | null): { views: PluginView[]; tools: PluginView[] } {
    const files = () => this.host.files()
    const ok = (v: PluginView) => !v.contextual || whenHolds(this.states.find((s) => s.manifest.id === v.plugin)?.manifest.when, files, active)
    const shown = this.views.filter(ok)
    return { views: shown.filter((v) => !v.contextual), tools: shown.filter((v) => v.contextual) }
  }

  runCommand(id: string): void {
    const c = this.commands.find((x) => x.id === id)
    if (!c) return this.host.notify(`No command ${id} (is its plugin switched on?)`)
    Promise.resolve(c.run()).catch((e) => this.host.notify(`${c.title}: ${e?.message ?? e}`))
  }

  private publishMenu(): void {
    window.api.setPluginMenu(this.commands.map(({ id, title, plugin, key }) => ({ id, title, plugin, key: key && toAccelerator(key) })))
  }

  private async start(state: PluginState): Promise<void> {
    const { manifest } = state
    const id = manifest.id
    const run: Running = { disposers: [], events: new Map() }
    this.running.set(id, run)
    const renderer = RENDERER[id]
    if (!renderer) return // a main-only plugin
    const own = (undo: () => void) => void run.disposers.push(undo)
    const current = () => this.states.find((s) => s.manifest.id === id) ?? state
    const addExtension = (ext: Extension) => {
      this.editorExts.set(id, [...(this.editorExts.get(id) ?? []), ext])
      this.refreshExtensions()
    }
    const ctx: RendererContext = {
      id,
      manifest,
      host: this.host,
      editor: { ...this.host.editor, extension: addExtension },
      settings: {
        global: () => current().globalSettings,
        vault: () => current().vaultSettings,
        setGlobal: async (values) => void (await window.api.changePlugin(id, { globalSettings: values })),
        setVault: async (values) => void (await window.api.changePlugin(id, { vaultSettings: values })),
      },
      invoke: (name, ...args) => window.api.pluginInvoke(id, name, args) as Promise<never>,
      on: (event, cb) => {
        const set = run.events.get(event) ?? new Set()
        set.add(cb)
        run.events.set(event, set)
      },
      views: {
        add: (v) => {
          const view: PluginView = { id: `${id}:${v.id}`, plugin: id, icon: v.icon ?? manifest.icon, tip: v.tip, component: v.component, contextual: !!v.contextual, ctx }
          this.views = [...this.views, view]
          own(() => (this.views = this.views.filter((x) => x !== view)))
        },
      },
      commands: {
        add: (c) => {
          const cmd: PluginCommand = { ...c, id: c.id.includes(':') ? c.id : `${id}:${c.id}`, plugin: manifest.name }
          this.commands = [...this.commands, cmd]
          if (c.key) this.refreshExtensions()
          own(() => {
            this.commands = this.commands.filter((x) => x !== cmd)
            if (c.key) this.refreshExtensions()
          })
          this.publishMenu()
        },
        run: (cid) => this.runCommand(cid.includes(':') ? cid : `${id}:${cid}`),
      },
      status: {
        item: (i) => {
          const item: StatusItem = { id: ++this.statusSeq, plugin: id, ...i }
          this.status = [...this.status, item]
          own(() => (this.status = this.status.filter((x) => x.id !== item.id)))
          return {
            set: (change) => (this.status = this.status.map((x) => (x.id === item.id ? { ...x, ...change } : x))),
          }
        },
      },
      live: {
        decorations: (fn) => {
          const live = liveDecorations(fn)
          addExtension(live.extension)
          return { refresh: live.refresh }
        },
      },
      cite: {
        source: (s) => {
          const src: CiteSource = { ...s, plugin: id }
          this.citeSources = [...this.citeSources, src]
          own(() => (this.citeSources = this.citeSources.filter((x) => x !== src)))
        },
      },
      panel: (component) => {
        const entry = { plugin: id, component, ctx }
        this.panels = [...this.panels, entry]
        own(() => (this.panels = this.panels.filter((x) => x !== entry)))
      },
      showSettings: () => this.host.showPlugin(id),
      openLink: (url) => window.api.pluginOpenLink(id, url),
      onDispose: (f) => own(f),
    }
    try {
      await renderer(ctx)
    } catch (e) {
      console.error(`Plugin ${manifest.name} failed to start:`, e)
      this.host.notify(`The ${manifest.name} plugin failed to start`)
      this.stop(id)
    }
  }

  private stop(id: string): void {
    const run = this.running.get(id)
    this.running.delete(id)
    for (const undo of (run?.disposers ?? []).reverse()) {
      try {
        undo()
      } catch (e) {
        console.error(`Stopping plugin ${id}:`, e)
      }
    }
    if (this.editorExts.delete(id)) this.refreshExtensions()
  }

  private refreshExtensions(): void {
    const keyed = this.commands.filter((c) => c.key)
    this.extensions = [
      ...[...this.editorExts.values()].flat(),
      ...(keyed.length ? [keymap.of(keyed.map((c) => ({ key: c.key!, preventDefault: true, run: () => (this.runCommand(c.id), true) })))] : []),
    ]
  }
}

/** A CodeMirror key ("Mod-Shift-k") as an Electron accelerator ("CmdOrCtrl+Shift+K"), for the menu. */
export function toAccelerator(key: string): string {
  return key
    .split('-')
    .map((p) => (p === 'Mod' ? 'CmdOrCtrl' : p.length === 1 ? p.toUpperCase() : p))
    .join('+')
}

/** Asks plugin live decorations to recompute. */
const refreshLive = StateEffect.define<null>()

/** An extension drawing `fn`'s decorations while the live view is on, and a way to redraw them in every editor. */
function liveDecorations(fn: (state: EditorState, file: string | null) => Range<Decoration>[]): { extension: Extension; refresh(): void } {
  const views = new Set<EditorView>()
  const compute = (view: EditorView): DecorationSet => {
    if (!isLive(view.state)) return Decoration.none
    try {
      return Decoration.set(fn(view.state, view.state.facet(liveFile)), true)
    } catch (e) {
      console.error('Plugin live decorations failed:', e)
      return Decoration.none
    }
  }
  const extension = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(readonly view: EditorView) {
        views.add(view)
        this.decorations = compute(view)
      }
      update(u: ViewUpdate) {
        const asked = u.transactions.some((tr) => tr.effects.some((e) => e.is(setLive) || e.is(refreshLive)))
        if (u.docChanged || u.viewportChanged || asked || isLive(u.state) !== isLive(u.startState)) this.decorations = compute(u.view)
      }
      destroy() {
        views.delete(this.view)
      }
    },
    { decorations: (v) => v.decorations },
  )
  return { extension, refresh: () => views.forEach((v) => v.dispatch({ effects: refreshLive.of(null) })) }
}
