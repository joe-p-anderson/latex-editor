// Each plugin's renderer half, by id (only plugins that have one).
import type { PluginRenderer } from '../renderer/src/lib/plugins.svelte'
import problemBank from './problem-bank/renderer'
import symbols from './symbols/renderer'
import zotero from './zotero/renderer'

export const RENDERER: Record<string, PluginRenderer> = { symbols, 'problem-bank': problemBank, zotero }
