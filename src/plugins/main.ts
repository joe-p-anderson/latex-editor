// Each plugin's main-process half, by id (only plugins that have one).
import type { PluginMain } from '../main/plugins'

export const MAIN: Record<string, PluginMain> = {}
