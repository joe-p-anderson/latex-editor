// Plugins: optional features that ship with the app and can be switched on
// and off per vault (docs/design/PLUGINS.md). This file holds what both
// processes share: the manifest format, settings fields, and the rules for
// whether a plugin is on. The engines are src/main/plugins.ts and
// src/renderer/src/lib/plugins.svelte.ts; the plugins are in src/plugins/.

export interface Disposable {
  dispose(): void
}

/** A setting a plugin declares; the Plugins panel draws a field for each. */
export type SettingField = { key: string; label: string; help?: string } & (
  | { type: 'bool'; default: boolean }
  | { type: 'string' | 'path' | 'vaultFile' | 'vaultDir'; default: string; placeholder?: string }
  | { type: 'enum'; options: string[]; default: string }
  | { type: 'number'; default: number; min?: number; max?: number }
)

export type SettingValue = string | number | boolean
export type SettingValues = Record<string, SettingValue>

export interface PluginManifest {
  /** Lower-case, dashed: 'problem-bank'. Also its folder in src/plugins/ and its key in settings. */
  id: string
  name: string
  /** One or two sentences for the Plugins panel. */
  description: string
  /** A name from icons.ts, or the inner markup of a 24×24 stroked SVG. */
  icon: string
  /** Whether it's on in a vault that hasn't said. */
  defaultEnabled: boolean
  /** When its contextual views show in the activity bar's tools (it still runs otherwise). */
  when?: PluginWhen
  /** Settings shared by every vault (settings.json) and per vault (.vault.json). */
  settings?: { global?: SettingField[]; vault?: SettingField[] }
}

/** Conditions for a contextual view; all given ones must hold. */
export interface PluginWhen {
  /** The vault has a file matching this glob, e.g. "**\/*.bib". */
  vaultHas?: string
  /** The open file matches this glob, e.g. "*.tex". */
  fileIs?: string
}

/** A plugin's entry in settings.json: the default for vaults and its global settings. */
export interface GlobalPluginEntry {
  enabled?: boolean
  settings?: SettingValues
}

/** A plugin's entry in .vault.json: on or off here, and its vault settings. */
export type VaultPluginEntry = boolean | { enabled?: boolean; settings?: SettingValues }

/** What the Plugins panel and the renderer engine know about a plugin. */
export interface PluginState {
  manifest: PluginManifest
  /** On in the open vault. */
  enabled: boolean
  /** On for vaults that haven't said (settings.json, else the manifest). */
  enabledByDefault: boolean
  /** Whether the open vault has its own say (rather than following the default). */
  vaultChose: boolean
  /** Settings with defaults filled in. */
  globalSettings: SettingValues
  vaultSettings: SettingValues
}

/** Whether a plugin is on: the vault's choice, else the global default, else the manifest's. */
export function resolveEnabled(manifest: PluginManifest, global?: GlobalPluginEntry, vault?: VaultPluginEntry): boolean {
  const own = vaultEnabled(vault)
  if (own !== undefined) return own
  return global?.enabled ?? manifest.defaultEnabled
}

/** The vault's own on/off choice, if it made one. */
export function vaultEnabled(vault?: VaultPluginEntry): boolean | undefined {
  if (typeof vault === 'boolean') return vault
  return vault?.enabled
}

/** The settings stored in a vault entry (none for a bare true/false). */
export function vaultSettingsOf(vault?: VaultPluginEntry): SettingValues {
  return typeof vault === 'object' && vault ? (vault.settings ?? {}) : {}
}

/** `stored`, checked against `fields`: unknown keys dropped, bad values replaced by defaults. */
export function settingsWithDefaults(fields: SettingField[] | undefined, stored: SettingValues | undefined): SettingValues {
  const out: SettingValues = {}
  for (const f of fields ?? []) {
    const v = stored?.[f.key]
    out[f.key] = v !== undefined && validSetting(f, v) ? v : f.default
  }
  return out
}

/** Whether `value` fits `field`. */
export function validSetting(field: SettingField, value: unknown): value is SettingValue {
  switch (field.type) {
    case 'bool':
      return typeof value === 'boolean'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max)
    case 'enum':
      return typeof value === 'string' && field.options.includes(value)
    case 'vaultFile':
    case 'vaultDir':
      // Vault-relative, forward slashes, and not climbing out of the vault.
      return typeof value === 'string' && !/^([A-Za-z]:|[\\/])/.test(value) && !value.split(/[\\/]/).includes('..')
    default:
      return typeof value === 'string'
  }
}

/** The full state of each plugin, from the stored entries. */
export function pluginStates(
  manifests: PluginManifest[],
  global: Record<string, GlobalPluginEntry> | undefined,
  vault: Record<string, VaultPluginEntry> | undefined,
): PluginState[] {
  return manifests.map((manifest) => {
    const g = global?.[manifest.id]
    const v = vault?.[manifest.id]
    return {
      manifest,
      enabled: resolveEnabled(manifest, g, v),
      enabledByDefault: g?.enabled ?? manifest.defaultEnabled,
      vaultChose: vaultEnabled(v) !== undefined,
      globalSettings: settingsWithDefaults(manifest.settings?.global, g?.settings),
      vaultSettings: settingsWithDefaults(manifest.settings?.vault, vaultSettingsOf(v)),
    }
  })
}

/**
 * A glob as a RegExp over vault-relative paths: `*` stays within a folder,
 * `**` crosses folders, `?` is one character. A pattern without a slash
 * matches the file name anywhere ("*.bib").
 */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      // "**/" matches no folders too.
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(glob.includes('/') ? `^${re}$` : `(?:^|/)${re}$`, 'i')
}

/** Whether `when` holds for the vault's files and the open file. */
export function whenHolds(when: PluginWhen | undefined, files: () => string[], active: string | null): boolean {
  if (!when) return true
  if (when.fileIs && !(active && globToRegExp(when.fileIs).test(active))) return false
  if (when.vaultHas) {
    const re = globToRegExp(when.vaultHas)
    if (!files().some((f) => re.test(f))) return false
  }
  return true
}
