// Per-install settings, in <userData>/settings.json (%APPDATA%\<app>\ on
// Windows). Unlike .vault.json, nothing here travels with a vault.
import { app } from 'electron'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeAppAppearance, type AppAppearance } from '../shared/appearance'
import type { GlobalPluginEntry } from '../shared/plugin'

export interface AppSettings {
  /** The vault opened last, reopened at launch. */
  lastVault?: string
  /** Vaults opened before, most recent first, for the welcome screen. */
  recentVaults?: { root: string; opened: number }[]
  /** The global template library; <userData>/templates when unset. */
  templates?: string
  /** Look, page and type (docs/design/ENDLEAF.md); read through appAppearance(). */
  appearance?: Partial<AppAppearance>
  /** Each plugin's default for vaults that haven't said, and its global settings. */
  plugins?: Record<string, GlobalPluginEntry>
}

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

export async function loadSettings(): Promise<AppSettings> {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

/** Merges `changes` into the saved settings. */
export async function saveSettings(changes: Partial<AppSettings>): Promise<void> {
  const s = { ...(await loadSettings()), ...changes }
  await writeFile(settingsPath(), JSON.stringify(s, null, 2))
}

/** The global snippet files, null where missing. */
export async function globalSnippets(): Promise<{ snippets: string | null; mathSnippets: string | null }> {
  const read = (name: string) => readFile(join(app.getPath('userData'), name), 'utf8').catch(() => null)
  return { snippets: await read('snippets.txt'), mathSnippets: await read('math-snippets.txt') }
}

/** The global template library, created if it doesn't exist yet. */
export async function globalTemplatesDir(): Promise<string> {
  const dir = (await loadSettings()).templates ?? join(app.getPath('userData'), 'templates')
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * The app was called latex-editor, so its settings were in
 * %APPDATA%\latex-editor. On the first run as endleaf, copies settings.json
 * across and keeps the global template library where it was (nothing is
 * moved or deleted).
 */
export async function migrateSettings(): Promise<void> {
  const old = join(app.getPath('appData'), 'latex-editor')
  const exists = (p: string) => stat(p).then(() => true, () => false)
  if (old === app.getPath('userData') || (await exists(settingsPath())) || !(await exists(join(old, 'settings.json')))) return
  await mkdir(app.getPath('userData'), { recursive: true })
  await copyFile(join(old, 'settings.json'), settingsPath())
  if (!(await loadSettings()).templates && (await exists(join(old, 'templates')))) await saveSettings({ templates: join(old, 'templates') })
}

/** The global appearance, with defaults for anything unset. */
export async function appAppearance(): Promise<AppAppearance> {
  return normalizeAppAppearance((await loadSettings()).appearance)
}

/** Merges `changes` into the global appearance; returns the result. */
export async function saveAppAppearance(changes: Partial<AppAppearance>): Promise<AppAppearance> {
  const next = normalizeAppAppearance({ ...(await appAppearance()), ...changes })
  await saveSettings({ appearance: next })
  return next
}
