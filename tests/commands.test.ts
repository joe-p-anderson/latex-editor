import { describe, expect, it } from 'vitest'
import { CommandRegistry, keyLabel, paletteLabel, pluginCommand, searchCommands, type Command, type Context } from '../src/renderer/src/lib/commands'

const NONE: Context = { vault: false, editor: false, tex: false, build: true }
const TEX: Context = { vault: true, editor: true, tex: true, build: true }

const cmd = (c: Partial<Command> & { id: string }): Command => ({ title: c.id, category: 'Edit', run: () => {}, ...c })

describe('command registry', () => {
  it('lists what was registered, and forgets it when unregistered', () => {
    const r = new CommandRegistry()
    const off = r.register(cmd({ id: 'a' }), cmd({ id: 'b' }))
    expect(r.all().map((c) => c.id)).toEqual(['a', 'b'])
    off()
    expect(r.all()).toEqual([])
  })

  it('refuses a second command with the same id', () => {
    const r = new CommandRegistry()
    r.register(cmd({ id: 'a' }))
    expect(() => r.register(cmd({ id: 'a' }))).toThrow(/a/)
  })

  it('offers only the commands whose condition holds', () => {
    const r = new CommandRegistry()
    r.register(cmd({ id: 'always' }), cmd({ id: 'vault', when: ['vault'] }), cmd({ id: 'tex', when: ['vault', 'tex'] }))
    expect(r.available(NONE).map((c) => c.id)).toEqual(['always'])
    expect(r.available({ vault: true, editor: true, tex: false, build: true }).map((c) => c.id)).toEqual(['always', 'vault'])
    expect(r.available(TEX).map((c) => c.id)).toEqual(['always', 'vault', 'tex'])
  })
})

const press = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}, code?: string) => ({
  key,
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
})

describe('keys', () => {
  it('runs the command bound to a key, if its condition holds', () => {
    const ran: string[] = []
    const r = new CommandRegistry()
    r.register(cmd({ id: 'build', key: 'Mod-Shift-b', when: ['vault'], run: () => void ran.push('build') }))
    expect(r.handleKey(press('B', { ctrl: true, shift: true }), NONE, 'app')).toBe(false)
    expect(r.handleKey(press('b', { ctrl: true }), TEX, 'app')).toBe(false)
    expect(r.handleKey(press('B', { ctrl: true, shift: true }), TEX, 'app')).toBe(true)
    expect(ran).toEqual(['build'])
  })

  it('keeps editor keys to the editor', () => {
    const ran: string[] = []
    const r = new CommandRegistry()
    r.register(cmd({ id: 'bold', key: 'Mod-b', editorKey: true, run: () => void ran.push('bold') }))
    expect(r.handleKey(press('b', { ctrl: true }), TEX, 'app')).toBe(false)
    expect(r.handleKey(press('b', { ctrl: true }), TEX, 'editor')).toBe(true)
    expect(ran).toEqual(['bold'])
  })

  it('lets a key fall through when its command declines', () => {
    const r = new CommandRegistry()
    r.register(cmd({ id: 'rename', key: 'F2', editorKey: true, run: () => false }))
    expect(r.handleKey(press('F2'), TEX, 'editor')).toBe(false)
  })

  it("says why a key did nothing, when its command can't run and has a hint", () => {
    const hints: string[] = []
    const r = new CommandRegistry(undefined, (h) => hints.push(h))
    r.register(cmd({ id: 'cite', key: 'Mod-Shift-c', when: ['vault', 'tex'], hint: 'Open a .tex file to cite' }), cmd({ id: 'plain', key: 'Mod-Shift-x', when: ['tex'] }))
    expect(r.handleKey(press('C', { ctrl: true, shift: true }), { vault: true, editor: true, tex: false, build: true }, 'app')).toBe(true)
    expect(r.handleKey(press('X', { ctrl: true, shift: true }), { vault: true, editor: true, tex: false, build: true }, 'app')).toBe(false)
    expect(hints).toEqual(['Open a .tex file to cite'])
  })

  it("prefers a command that runs over another one's hint on the same key", () => {
    const hints: string[] = []
    const r = new CommandRegistry(undefined, (h) => hints.push(h))
    r.register(cmd({ id: 'tex', key: 'F5', when: ['tex'], hint: 'no' }), cmd({ id: 'any', key: 'F5' }))
    expect(r.handleKey(press('F5'), NONE, 'app')).toBe(true)
    expect(hints).toEqual([])
  })

  it('matches Alt keys by the physical key when Alt changes the character', () => {
    const r = new CommandRegistry()
    r.register(cmd({ id: 'eq', key: 'Mod-Alt-e', editorKey: true }))
    expect(r.handleKey(press('é', { ctrl: true, alt: true }, 'KeyE'), TEX, 'editor')).toBe(true)
  })
})

describe('chords', () => {
  const chorded = () => {
    const ran: string[] = []
    const r = new CommandRegistry()
    r.register(
      cmd({ id: 'shortcuts', key: 'Mod-k Mod-s', run: () => void ran.push('shortcuts') }),
      cmd({ id: 'save', key: 'Mod-s', run: () => void ran.push('save') }),
    )
    return { r, ran }
  }

  it('runs a two-key chord: the first key arms it, the second runs it', () => {
    const { r, ran } = chorded()
    expect(r.handleKey(press('k', { ctrl: true }), TEX, 'app')).toBe(true)
    expect(ran).toEqual([])
    expect(r.handleKey(press('s', { ctrl: true }), TEX, 'app')).toBe(true)
    expect(ran).toEqual(['shortcuts'])
  })

  it('cancels on Escape or any other key, swallowing it, and then keys work as usual', () => {
    const { r, ran } = chorded()
    r.handleKey(press('k', { ctrl: true }), TEX, 'app')
    expect(r.handleKey(press('Escape'), TEX, 'app')).toBe(true)
    r.handleKey(press('k', { ctrl: true }), TEX, 'app')
    expect(r.handleKey(press('x', { ctrl: true }), TEX, 'app')).toBe(true)
    expect(ran).toEqual([])
    expect(r.handleKey(press('s', { ctrl: true }), TEX, 'app')).toBe(true)
    expect(ran).toEqual(['save'])
  })

  it("doesn't arm for a chord whose condition doesn't hold", () => {
    const r = new CommandRegistry()
    r.register(cmd({ id: 'x', key: 'Mod-k Mod-s', when: ['vault'] }))
    expect(r.handleKey(press('k', { ctrl: true }), NONE, 'app')).toBe(false)
  })

  it('ignores a modifier pressed on its own between the two keys', () => {
    const { r, ran } = chorded()
    r.handleKey(press('k', { ctrl: true }), TEX, 'app')
    r.handleKey(press('Control', { ctrl: true }), TEX, 'app')
    r.handleKey(press('s', { ctrl: true }), TEX, 'app')
    expect(ran).toEqual(['shortcuts'])
  })

  it('labels a chord as its two keys', () => {
    expect(keyLabel('Mod-k Mod-s', false)).toBe('Ctrl+K Ctrl+S')
  })
})

describe("a plugin's command", () => {
  const sync = pluginCommand({ id: 'zotero:sync', title: 'Sync Library', plugin: 'Zotero', key: 'Mod-Alt-z' }, () => {})

  it('goes under Tools with its plugin name, its key bound in the editor', () => {
    expect(paletteLabel(sync)).toBe('Tools: Zotero: Sync Library')
    const r = new CommandRegistry()
    r.register(sync)
    expect(r.handleKey(press('z', { ctrl: true, alt: true }), TEX, 'app')).toBe(false)
    expect(r.handleKey(press('z', { ctrl: true, alt: true }), TEX, 'editor')).toBe(true)
  })

  it('can go in Insert instead, as one of its items, for a .tex file', () => {
    const symbols = pluginCommand({ id: 'symbols:open', title: 'Symbols…', plugin: 'Symbols', category: 'Insert' }, () => {})
    expect(paletteLabel(symbols)).toBe('Insert: Symbols…')
    const r = new CommandRegistry()
    r.register(symbols)
    expect(r.available({ vault: true, editor: true, tex: false, build: true })).toEqual([])
    expect(r.available(TEX)).toEqual([symbols])
  })

  it('needs an open file, as it acts on the editor', () => {
    const r = new CommandRegistry()
    r.register(sync)
    expect(r.available({ vault: true, editor: false, tex: false, build: true })).toEqual([])
    expect(r.available({ vault: true, editor: true, tex: false, build: true })).toEqual([sync])
  })
})

describe('key labels', () => {
  it('reads as on a keyboard', () => {
    expect(keyLabel('Mod-Shift-b', false)).toBe('Ctrl+Shift+B')
    expect(keyLabel('Alt-ArrowLeft', false)).toBe('Alt+Left')
    expect(keyLabel('F2', false)).toBe('F2')
  })

  it("gives a registered command's key by id, or null without one", () => {
    const r = new CommandRegistry()
    r.register(cmd({ id: 'file.save', key: 'Mod-s' }), cmd({ id: 'file.quiet' }))
    expect(r.keyFor('file.save', false)).toBe('Ctrl+S')
    expect(r.keyFor('file.quiet', false)).toBeNull()
    expect(r.keyFor('file.missing', false)).toBeNull()
  })
})

describe('palette', () => {
  const recompile = cmd({ id: 'build.recompile', title: 'Recompile', category: 'Build', keywords: ['compile', 'build', 'pdf'] })
  const pdf = cmd({ id: 'view.pdf', title: 'Toggle PDF', category: 'View', keywords: ['compile', 'build', 'preview'] })
  const sidebar = cmd({ id: 'view.sidebar', title: 'Toggle Sidebar', category: 'View' })
  const zotero = cmd({ id: 'zotero:sync', title: 'Sync Library', category: 'Tools', group: 'Zotero' })
  const all = [recompile, pdf, sidebar, zotero]

  it('labels a command by its category, and a plugin command by its plugin too', () => {
    expect(paletteLabel(recompile)).toBe('Build: Recompile')
    expect(paletteLabel(zotero)).toBe('Tools: Zotero: Sync Library')
  })

  it('lists everything, in order, for an empty query', () => {
    expect(searchCommands(all, '')).toEqual(all)
  })

  it.each(['compile', 'build', 'pdf'])('finds Recompile and Toggle PDF by "%s"', (q) => {
    const found = searchCommands(all, q)
    expect(found).toContain(recompile)
    expect(found).toContain(pdf)
    expect(found).not.toContain(sidebar)
  })

  it('matches the label fuzzily, the best match first', () => {
    expect(searchCommands(all, 'tog side')).toEqual([sidebar])
    expect(searchCommands(all, 'zot')[0]).toBe(zotero)
  })
})
