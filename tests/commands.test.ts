import { describe, expect, it } from 'vitest'
import { CommandRegistry, keyLabel, paletteLabel, searchCommands, type Command, type Context } from '../src/renderer/src/lib/commands'

const NONE: Context = { vault: false, tex: false }
const TEX: Context = { vault: true, tex: true }

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
    expect(r.available({ vault: true, tex: false }).map((c) => c.id)).toEqual(['always', 'vault'])
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
    expect(r.handleKey(press('C', { ctrl: true, shift: true }), { vault: true, tex: false }, 'app')).toBe(true)
    expect(r.handleKey(press('X', { ctrl: true, shift: true }), { vault: true, tex: false }, 'app')).toBe(false)
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

describe('key labels', () => {
  it('reads as on a keyboard', () => {
    expect(keyLabel('Mod-Shift-b', false)).toBe('Ctrl+Shift+B')
    expect(keyLabel('Alt-ArrowLeft', false)).toBe('Alt+Left')
    expect(keyLabel('F2', false)).toBe('F2')
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
