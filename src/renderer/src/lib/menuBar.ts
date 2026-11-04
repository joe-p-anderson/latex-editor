// The menu bar, generated from the command registry (./commands.ts). The
// main process adds its native items (src/main/menu.ts).
import { MENU_BAR, type MenuBarMenu, type MenuLabel, type MenuNode } from '@shared/menu'
import { holds, isChord, keyLabel, type Command, type Context } from './commands'
import { HELP_ORDER } from './coreCommands'

/** Menus with a fixed order, for commands registered apart from the core ones (Getting Started, Show Hints Again); others follow. */
const ORDER: Partial<Record<MenuLabel, string[]>> = { Help: HELP_ORDER }

/**
 * Each menu's items: its core commands in registration order, or Help's in
 * HELP_ORDER (those sharing a `submenu` gathered where the first one is),
 * then each plugin's under its name. A command whose `when` doesn't hold is
 * shown disabled.
 */
export function menuBar(cmds: Command[], ctx: Context, mac?: boolean): MenuBarMenu[] {
  const node = (c: Command): MenuNode => ({
    kind: 'command',
    id: c.id,
    label: c.menuTitle?.(ctx) ?? c.title,
    // A chord (Ctrl+K Ctrl+S) isn't an Electron accelerator; the Keyboard Shortcuts panel shows it.
    ...(c.key && !isChord(c.key) ? { accelerator: keyLabel(c.key, mac) } : {}),
    enabled: holds(c, ctx),
  })
  return MENU_BAR.map((label) => {
    const order = ORDER[label] ?? []
    const rank = (c: Command) => (order.includes(c.id) ? order.indexOf(c.id) : order.length)
    const mine = cmds.filter((c) => c.category === label && c.menu !== false).sort((a, b) => rank(a) - rank(b))
    const items: MenuNode[] = []
    for (const c of mine.filter((c) => !c.group)) {
      if (!c.submenu) items.push(node(c))
      else {
        const sub = items.find((n): n is Extract<MenuNode, { kind: 'submenu' }> => n.kind === 'submenu' && n.label === c.submenu)
        if (sub) sub.items.push(node(c))
        else items.push({ kind: 'submenu', label: c.submenu, items: [node(c)] })
      }
    }
    const groups = new Map<string, Command[]>()
    for (const c of mine) if (c.group) groups.set(c.group, [...(groups.get(c.group) ?? []), c])
    for (const [group, cs] of groups) items.push({ kind: 'separator' }, { kind: 'heading', label: group }, ...cs.map(node))
    return { label, items }
  })
}
