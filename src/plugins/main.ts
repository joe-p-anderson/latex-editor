// Each plugin's main-process half, by id (only plugins that have one).
import type { PluginMain } from '../main/plugins'
import problemBank from './problem-bank/main'
import zotero from './zotero/main'

export const MAIN: Record<string, PluginMain> = { 'problem-bank': problemBank, zotero }
