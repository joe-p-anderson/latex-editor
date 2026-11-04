// Help → Keyboard Shortcuts: every command with a key, from the command
// registry (./commands.ts), grouped by category. Read-only.
import { MENU_BAR } from '@shared/menu'
import { keyLabel, type Category, type Command } from './commands'

export interface ShortcutGroup {
  category: Category
  /** `title` has a plugin's name in front ("Zotero: Sync Library"); `key` is for people ("Ctrl+K Ctrl+S"). */
  items: { id: string; title: string; key: string }[]
}

/**
 * The commands with a key, by category in menu-bar order, keeping only
 * those matching `query`: each of its words is found in the category, the
 * title or the key ("ctrl+shift"), ignoring case. Empty groups are left out.
 */
export function shortcutGroups(cmds: Command[], query: string, mac?: boolean): ShortcutGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const items = cmds
    .filter((c) => c.key)
    .map((c) => ({ c, id: c.id, title: [c.group, c.title].filter(Boolean).join(': '), key: keyLabel(c.key!, mac) }))
    .filter((i) => words.every((w) => `${i.c.category} ${i.title} ${i.key}`.toLowerCase().includes(w)))
  return MENU_BAR.map((category) => ({
    category,
    items: items.filter((i) => i.c.category === category).map(({ id, title, key }) => ({ id, title, key })),
  })).filter((g) => g.items.length)
}
