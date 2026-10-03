// Each plugin's renderer half, by id (only plugins that have one).
import type { PluginRenderer } from '../renderer/src/lib/plugins.svelte'
import symbols from './symbols/renderer'

export const RENDERER: Record<string, PluginRenderer> = { symbols }
