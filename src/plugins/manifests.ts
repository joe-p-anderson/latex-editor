// Every plugin the app ships, in the order the Plugins panel lists them.
// Adding a plugin: its folder (manifest.ts, and main.ts and/or renderer.ts),
// then a line here and in main.ts and/or renderer.ts beside this file.
import type { PluginManifest } from '../shared/plugin'
import symbols from './symbols/manifest'

export const MANIFESTS: PluginManifest[] = [symbols]
