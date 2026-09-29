// Per-install settings, in <userData>/settings.json (%APPDATA%\<app>\ on
// Windows). Unlike .vault.json, nothing here travels with a vault.
import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface AppSettings {
  /** The vault opened last, reopened at launch. */
  lastVault?: string
  /** The global template library; <userData>/templates when unset. */
  templates?: string
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

/** The global template library, created if it doesn't exist yet. */
export async function globalTemplatesDir(): Promise<string> {
  const dir = (await loadSettings()).templates ?? join(app.getPath('userData'), 'templates')
  await mkdir(dir, { recursive: true })
  return dir
}
