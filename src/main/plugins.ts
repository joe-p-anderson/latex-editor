// The main-process half of the plugin engine (docs/design/PLUGINS.md).
// It decides which plugins are on for the open vault, starts and stops
// their main halves, and gives each a MainContext: the vault's files, its
// settings, a cache folder, build hooks, and a channel to its renderer half.
import type { BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CompileResult } from '../shared/api'
import { pluginStates, validSetting, type PluginManifest, type PluginState, type SettingField, type SettingValues } from '../shared/plugin'
import { MANIFESTS } from '../plugins/manifests'
import { MAIN } from '../plugins/main'
import { onAfterBuild, onBeforeBuild, onProblemFixes, type AfterBuild, type BeforeBuild, type ProblemFixer } from './buildhooks'
import { compileScratch } from './compile'
import { loadSettings, saveSettings } from './settings'
import type { Vault } from './vault'

/** What a plugin's main half gets. Everything it registers is undone when it's switched off. */
export interface MainContext {
  readonly id: string
  readonly vault: {
    readonly root: string
    readonly name: string
    /** Absolute path of a vault-relative one (refuses paths outside the vault). */
    abs(rel: string): string
    /** Vault-relative path of an absolute one, or null when outside. */
    rel(abs: string): string | null
    read(rel: string): Promise<string>
    /** The file's text, or null if it doesn't exist. */
    readOptional(rel: string): Promise<string | null>
    /** Writes the file, making its folder if needed. */
    write(rel: string, text: string): Promise<void>
    /** Every visible file, vault-relative. */
    files(): Promise<string[]>
    /** Each file added, changed or removed. */
    onFile(f: (event: 'add' | 'change' | 'unlink', rel: string) => void): void
  }
  readonly settings: {
    /** Current values, defaults filled in. */
    global(): SettingValues
    vault(): SettingValues
    setGlobal(values: SettingValues): Promise<void>
    setVault(values: SettingValues): Promise<void>
    /** After either set changes (from the Plugins panel or a set call). */
    onChange(f: () => void): void
  }
  /** <vault>/.texcache/plugins/<id>: for indexes and scratch builds; never shown in the file tree. */
  readonly cacheDir: string
  /** Answers `ctx.invoke(name, …args)` from the renderer half. */
  handle(name: string, fn: (...args: any[]) => unknown): void
  /** Sends `ctx.on(event, …)` to the renderer half. */
  emit(event: string, data?: unknown): void
  readonly build: {
    /** Before a build's first pass (it may write files the build reads, e.g. a .bib). */
    before(f: BeforeBuild): void
    /** After a build is diagnosed; may return problems to add. */
    after(f: AfterBuild): void
    /** Extra quick fixes for a build's problems. */
    fixes(f: ProblemFixer): void
    /** Builds a generated document in the plugin's cache folder (e.g. a preview). */
    scratch(name: string, source: string): Promise<CompileResult>
  }
  onDispose(f: () => void): void
}

export type PluginMain = (ctx: MainContext) => void | Promise<void>

interface Running {
  disposers: (() => void)[]
  handlers: Map<string, (...args: any[]) => unknown>
  settingsListeners: Set<() => Promise<void>>
}

export class PluginHost {
  private running = new Map<string, Running>()
  private vault: Vault | null = null

  constructor(
    private readonly win: () => BrowserWindow | null,
    private readonly manifests: PluginManifest[] = MANIFESTS,
  ) {}

  /** Every plugin's state for the open vault (or for no vault: the defaults). */
  async states(): Promise<PluginState[]> {
    return pluginStates(this.manifests, (await loadSettings()).plugins, this.vault?.plugins)
  }

  /** Switches to `vault` (null when none is open): stops every plugin, then starts the ones on there. */
  async open(vault: Vault | null): Promise<void> {
    for (const id of [...this.running.keys()]) this.stop(id)
    this.vault = vault
    await this.sync()
  }

  /**
   * Changes a plugin's switches or settings. `vaultEnabled` null makes the
   * vault follow the default again. Starts or stops it as needed, and tells
   * the renderer. Returns the new states.
   */
  async change(
    id: string,
    c: { vaultEnabled?: boolean | null; defaultEnabled?: boolean; vaultSettings?: SettingValues; globalSettings?: SettingValues },
  ): Promise<PluginState[]> {
    const manifest = this.manifest(id)
    if (c.defaultEnabled !== undefined || c.globalSettings) {
      const all = (await loadSettings()).plugins ?? {}
      const entry = { ...all[id] }
      if (c.defaultEnabled !== undefined) entry.enabled = c.defaultEnabled
      if (c.globalSettings) entry.settings = { ...entry.settings, ...checked(manifest.settings?.global, c.globalSettings) }
      await saveSettings({ plugins: { ...all, [id]: entry } })
    }
    if ((c.vaultEnabled !== undefined || c.vaultSettings) && this.vault) {
      await this.vault.savePlugin(id, {
        enabled: c.vaultEnabled,
        settings: c.vaultSettings && checked(manifest.settings?.vault, c.vaultSettings),
      })
    }
    if (c.vaultSettings || c.globalSettings) await Promise.all([...(this.running.get(id)?.settingsListeners ?? [])].map((f) => f()))
    await this.sync()
    const states = await this.states()
    this.win()?.webContents.send('plugins:changed', states)
    return states
  }

  /** Calls a handler a plugin's main half registered. */
  async invoke(id: string, name: string, args: unknown[]): Promise<unknown> {
    const fn = this.running.get(id)?.handlers.get(name)
    if (!fn) throw new Error(`Plugin ${id} has no handler "${name}"${this.running.has(id) ? '' : ' (it is switched off)'}`)
    return fn(...args)
  }

  /** Starts the plugins that should be on and stops the ones that shouldn't. */
  private async sync(): Promise<void> {
    const states = await this.states()
    for (const s of states) {
      const id = s.manifest.id
      const on = !!this.vault && s.enabled
      if (on && !this.running.has(id)) await this.start(id)
      else if (!on && this.running.has(id)) this.stop(id)
    }
  }

  private manifest(id: string): PluginManifest {
    const m = this.manifests.find((x) => x.id === id)
    if (!m) throw new Error(`No plugin "${id}"`)
    return m
  }

  private async start(id: string): Promise<void> {
    const main = MAIN[id]
    const vault = this.vault!
    const manifest = this.manifest(id)
    const run: Running = { disposers: [], handlers: new Map(), settingsListeners: new Set() }
    this.running.set(id, run)
    if (!main) return // a renderer-only plugin
    const own = <T extends () => void>(undo: T) => void run.disposers.push(undo)
    const stored = async () => (await this.states()).find((x) => x.manifest.id === id)!
    let current = await stored()
    run.settingsListeners.add(async () => {
      current = await stored()
    })
    const ctx: MainContext = {
      id,
      vault: {
        root: vault.root,
        name: vault.name,
        abs: (rel) => vault.abs(rel),
        rel: (abs) => vault.rel(abs),
        read: (rel) => readFile(vault.abs(rel), 'utf8'),
        readOptional: (rel) => readFile(vault.abs(rel), 'utf8').catch(() => null),
        write: async (rel, text) => {
          await mkdir(dirname(vault.abs(rel)), { recursive: true })
          await writeFile(vault.abs(rel), text, 'utf8')
        },
        files: () => vault.files(),
        onFile: (f) => own(vault.onFile(f)),
      },
      settings: {
        global: () => current.globalSettings,
        vault: () => current.vaultSettings,
        setGlobal: async (values) => void (await this.change(id, { globalSettings: values })),
        setVault: async (values) => void (await this.change(id, { vaultSettings: values })),
        onChange: (f) => {
          const g = async () => {
            current = await stored()
            f()
          }
          run.settingsListeners.add(g)
          own(() => run.settingsListeners.delete(g))
        },
      },
      cacheDir: join(vault.root, '.texcache', 'plugins', id),
      handle: (name, fn) => {
        run.handlers.set(name, fn)
        own(() => run.handlers.delete(name))
      },
      emit: (event, data) => this.win()?.webContents.send('plugins:event', id, event, data),
      build: {
        before: (f) => own(onBeforeBuild(f)),
        after: (f) => own(onAfterBuild(f)),
        fixes: (f) => own(onProblemFixes(f)),
        scratch: (name, source) => compileScratch(vault, join(vault.root, '.texcache', 'plugins', id), name, source),
      },
      onDispose: (f) => own(f),
    }
    try {
      await main(ctx)
    } catch (e) {
      console.error(`Plugin ${manifest.name} failed to start:`, e)
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
  }
}

/** The values of `values` that fit `fields` (anything else is dropped). */
function checked(fields: SettingField[] | undefined, values: SettingValues): SettingValues {
  const known = new Map((fields ?? []).map((f) => [f.key, f]))
  const out: SettingValues = {}
  for (const [k, v] of Object.entries(values)) {
    const f = known.get(k)
    if (f && validSetting(f, v)) out[k] = v
  }
  return out
}
