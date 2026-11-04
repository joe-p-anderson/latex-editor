import { describe, expect, it } from 'vitest'
import { CommandRegistry, type Command } from '../src/renderer/src/lib/commands'
import { coreCommands, type CoreActions } from '../src/renderer/src/lib/coreCommands'
import { shortcutGroups } from '../src/renderer/src/lib/shortcuts'

const actions = new Proxy({} as CoreActions, { get: () => () => true })
const core = (...extra: Command[]) => {
  const reg = new CommandRegistry()
  reg.register(...coreCommands(actions), ...extra)
  return reg.all()
}
/** Each listed shortcut as "Category: Title = Key". */
const listed = (cmds: Command[], query = '') => shortcutGroups(cmds, query, false).flatMap((g) => g.items.map((i) => `${g.category}: ${i.title} = ${i.key}`))

describe('the keyboard shortcuts panel', () => {
  it('lists the core keys', () => {
    expect(listed(core())).toEqual(expect.arrayContaining(['Build: Recompile = Ctrl+Shift+B', 'Edit: Find in Vault = Ctrl+Shift+F', 'Help: Keyboard Shortcuts = Ctrl+K Ctrl+S']))
  })

  it('leaves out commands without a key', () => {
    expect(listed(core()).some((l) => l.startsWith('Insert: Figure* ='))).toBe(false)
  })

  it('groups them by category, in menu-bar order', () => {
    expect(shortcutGroups(core(), '', false).map((g) => g.category)).toEqual(['File', 'Edit', 'Insert', 'View', 'Build', 'Tools', 'Help'])
  })

  it('lists a command added to the registry, a plugin one under its plugin name', () => {
    const sync: Command = { id: 'zotero:sync', title: 'Sync Library', category: 'Tools', group: 'Zotero', key: 'Mod-Alt-z', run: () => {} }
    expect(listed(core(sync))).toContain('Tools: Zotero: Sync Library = Ctrl+Alt+Z')
  })

  it('finds by title: "figure" finds Insert Figure', () => {
    expect(listed(core(), 'figure')).toEqual(['Insert: Figure = Ctrl+Alt+F'])
  })

  it('finds by category or key text', () => {
    expect(listed(core(), 'build')).toEqual(expect.arrayContaining(['Build: Recompile = Ctrl+Shift+B', 'Build: Show Cursor in PDF = Ctrl+Alt+J']))
    const shifted = listed(core(), 'ctrl+shift')
    expect(shifted).toContain('Build: Recompile = Ctrl+Shift+B')
    expect(shifted.every((l) => l.includes('Ctrl+Shift'))).toBe(true)
  })

  it('drops a group with nothing matching', () => {
    expect(shortcutGroups(core(), 'figure', false).map((g) => g.category)).toEqual(['Insert'])
  })
})
