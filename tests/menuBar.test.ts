import { describe, expect, it } from 'vitest'
import { CommandRegistry, pluginCommand, type Command, type Context } from '../src/renderer/src/lib/commands'
import { coreCommands, type CoreActions } from '../src/renderer/src/lib/coreCommands'
import { menuBar } from '../src/renderer/src/lib/menuBar'
import type { MenuNode } from '../src/shared/menu'

const actions = new Proxy({} as CoreActions, { get: () => () => true })
const TEX: Context = { vault: true, editor: true, tex: true, build: true }
const BIB: Context = { vault: true, editor: true, tex: false, build: true }

function bar(ctx: Context, extra: Command[] = []) {
  const reg = new CommandRegistry()
  reg.register(...coreCommands(actions), ...extra)
  return menuBar(reg.all(), ctx, false)
}
const menu = (ctx: Context, label: string, extra?: Command[]) => bar(ctx, extra).find((m) => m.label === label)!.items
/** Every command item in `items`, submenus included. */
const flat = (items: MenuNode[]): Extract<MenuNode, { kind: 'command' }>[] =>
  items.flatMap((n) => (n.kind === 'command' ? [n] : n.kind === 'submenu' ? flat(n.items) : []))
const item = (ctx: Context, label: string, id: string) => flat(menu(ctx, label)).find((n) => n.id === id)

describe('the menu bar', () => {
  it('has File, Edit, Insert, View, Build, Tools and Help, in that order', () => {
    expect(bar(TEX).map((m) => m.label)).toEqual(['File', 'Edit', 'Insert', 'View', 'Build', 'Tools', 'Help'])
  })

  it('shows each command its key', () => {
    expect(item(TEX, 'Build', 'build.recompile')).toMatchObject({ label: 'Recompile', accelerator: 'Ctrl+Shift+B' })
    expect(item(TEX, 'Edit', 'edit.findInVault')?.accelerator).toBe('Ctrl+Shift+F')
    expect(item(TEX, 'View', 'view.appearance')?.accelerator).toBe('Ctrl+,')
    expect(item(TEX, 'View', 'view.back')?.accelerator).toBe('Alt+Left')
    expect(item(TEX, 'Insert', 'insert.figureStar')?.accelerator).toBeUndefined()
  })

  it('calls Save "Save and Build" for a .tex file', () => {
    expect(item(TEX, 'File', 'file.save')).toMatchObject({ label: 'Save and Build', accelerator: 'Ctrl+S' })
    expect(item(BIB, 'File', 'file.save')?.label).toBe('Save')
  })

  it('puts bold, italic and emphasis in Insert → Format, ahead of the maths and environments', () => {
    const insert = menu(TEX, 'Insert')
    expect(insert[0]).toMatchObject({ kind: 'submenu', label: 'Format' })
    expect(flat([insert[0]]).map((n) => n.label)).toEqual(['Bold', 'Italic', 'Emphasis'])
    expect(flat(insert).map((n) => n.label)).toEqual(expect.arrayContaining(['Inline Maths', 'Figure', 'Figure*', 'Table…', 'Image…', 'Citation…']))
    expect(flat(menu(TEX, 'Edit')).some((n) => n.label === 'Bold' || n.label === 'Citation…')).toBe(false)
  })

  it("disables what can't run now rather than hiding it", () => {
    expect(item(BIB, 'Insert', 'insert.figure')?.enabled).toBe(false)
    expect(item(TEX, 'Insert', 'insert.figure')?.enabled).toBe(true)
    expect(item({ vault: false, editor: false, tex: false, build: true }, 'Build', 'build.recompile')?.enabled).toBe(false)
  })

  it('disables Recompile, and calls Save just "Save", without TeX', () => {
    const noTeX = { ...TEX, build: false }
    expect(item(noTeX, 'Build', 'build.recompile')?.enabled).toBe(false)
    expect(item(TEX, 'Build', 'build.recompile')?.enabled).toBe(true)
    expect(item(noTeX, 'File', 'file.save')).toMatchObject({ label: 'Save', enabled: true })
  })

  it("disables a plugin's command with no file open", () => {
    const sync = pluginCommand({ id: 'zotero:sync', title: 'Sync Library', plugin: 'Zotero' }, () => {})
    const enabled = (ctx: Context) => flat(menu(ctx, 'Tools', [sync])).find((n) => n.id === 'zotero:sync')?.enabled
    expect(enabled({ vault: true, editor: false, tex: false, build: true })).toBe(false)
    expect(enabled(BIB)).toBe(true)
  })

  it("lists a plugin's commands under its name in Tools", () => {
    const zotero: Command = { id: 'zotero:sync', title: 'Sync Library', category: 'Tools', group: 'Zotero', key: 'Mod-Alt-z', run: () => {} }
    const tools = menu(TEX, 'Tools', [zotero])
    const at = tools.findIndex((n) => n.kind === 'heading' && n.label === 'Zotero')
    expect(at).toBeGreaterThan(0)
    expect(tools[at - 1].kind).toBe('separator')
    expect(tools[at + 1]).toMatchObject({ kind: 'command', id: 'zotero:sync', accelerator: 'Ctrl+Alt+Z' })
  })

  it('leaves out commands that stay out of menus (the Ctrl+Tab cycle; spelling, a native checkbox)', () => {
    const ids = bar(TEX).flatMap((m) => flat(m.items).map((n) => n.id))
    expect(ids).not.toContain('view.recentTab')
    expect(ids).not.toContain('view.toggleSpelling')
  })
})

describe('the Help menu', () => {
  /** Getting Started and Show Hints Again, which their own features register after the core commands. */
  const own: Command[] = [
    { id: 'help.showHintsAgain', title: 'Show Hints Again', category: 'Help', run: () => {} },
    { id: 'help.gettingStarted', title: 'Getting Started', category: 'Help', run: () => {} },
  ]
  const help = (ctx = TEX, extra: Command[] = own) => {
    const reg = new CommandRegistry()
    reg.register(...coreCommands(actions), ...extra)
    return flat(menuBar(reg.all(), ctx, false).find((m) => m.label === 'Help')!.items)
  }

  it('has the six items in order, those registered later in their places', () => {
    expect(help().map((n) => n.label)).toEqual(['Keyboard Shortcuts', 'Getting Started', 'Maths Shortcuts…', 'Show Hints Again', 'Report an Issue…', 'About endleaf'])
  })

  it('keeps the core ones in order without the others', () => {
    expect(help(TEX, []).map((n) => n.label)).toEqual(['Keyboard Shortcuts', 'Maths Shortcuts…', 'Report an Issue…', 'About endleaf'])
  })

  it('has Maths Shortcuts moved there from Edit', () => {
    expect(flat(menu(TEX, 'Edit')).some((n) => n.label === 'Maths Shortcuts…')).toBe(false)
  })

  it('works with no vault open, but for Maths Shortcuts, which edits the vault’s file', () => {
    const enabled = help({ vault: false, editor: false, tex: false }, []).filter((n) => n.enabled).map((n) => n.label)
    expect(enabled).toEqual(['Keyboard Shortcuts', 'Report an Issue…', 'About endleaf'])
  })

  it('leaves the Keyboard Shortcuts chord out of the native menu, which has no chords', () => {
    expect(help()[0].label).toBe('Keyboard Shortcuts')
    expect(help()[0]).not.toHaveProperty('accelerator')
  })
})
