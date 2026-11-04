import { describe, expect, it } from 'vitest'
import { CommandRegistry, paletteLabel, searchCommands, type Context } from '../src/renderer/src/lib/commands'
import { coreCommands, type CoreActions } from '../src/renderer/src/lib/coreCommands'
import { emptyPlateKeys } from '../src/renderer/src/lib/emptyPlate'

/** Actions that record what ran. */
function recorder(): { actions: CoreActions; ran: string[] } {
  const ran: string[] = []
  const actions = new Proxy({} as CoreActions, {
    get: (_t, name: string) => (arg?: unknown) => {
      ran.push(arg === undefined ? name : `${name}(${arg})`)
      return true
    },
  })
  return { actions, ran }
}

const registry = () => {
  const r = recorder()
  const reg = new CommandRegistry()
  reg.register(...coreCommands(r.actions))
  return { reg, ran: r.ran }
}

const NONE: Context = { vault: false, editor: false, tex: false }
const BIB: Context = { vault: true, editor: true, tex: false }
const TEX: Context = { vault: true, editor: true, tex: true }
const labels = (ctx: Context) => registry().reg.available(ctx).map(paletteLabel)

describe('core commands', () => {
  it('include the commands a VS Code user looks for', () => {
    expect(labels(TEX)).toEqual(
      expect.arrayContaining(['Build: Recompile', 'View: Toggle PDF', 'View: Live View', 'File: New File…', 'Edit: Find in Vault', 'View: Appearance']),
    )
  })

  it('have an Insert command for each formatting key and environment, figure* and image and cite included', () => {
    const insert = registry()
      .reg.available(TEX)
      .filter((c) => c.category === 'Insert')
      .map((c) => c.title)
    expect(insert).toEqual(
      expect.arrayContaining(['Bold', 'Italic', 'Emphasis', 'Inline Maths', 'Display Maths', 'Equation Environment', 'Align* Environment', 'Figure', 'Figure*', 'Table…', 'Image…', 'Citation…']),
    )
  })

  it('hide vault-only commands with no vault open', () => {
    const shown = labels(NONE)
    expect(shown).toContain('Tools: Run Command…')
    expect(shown).toContain('File: Switch Vault…')
    expect(shown).not.toContain('Build: Recompile')
    expect(shown).not.toContain('File: New File…')
  })

  it('hide Insert commands unless a .tex file is active', () => {
    expect(labels(BIB).some((l) => l.startsWith('Insert:'))).toBe(false)
    expect(labels(TEX).some((l) => l.startsWith('Insert:'))).toBe(true)
  })

  it.each(['compile', 'build', 'pdf'])('are found by "%s": Recompile and Toggle PDF', (q) => {
    const found = searchCommands(registry().reg.available(TEX), q).map(paletteLabel)
    expect(found).toContain('Build: Recompile')
    expect(found).toContain('View: Toggle PDF')
  })

  const pressed = (k: string, m: { shift?: boolean; alt?: boolean; ctrl?: boolean } = {}, scope: 'app' | 'editor' = 'app', ctx = TEX) => {
    const { reg, ran } = registry()
    reg.handleKey({ key: k, ctrlKey: m.ctrl ?? true, altKey: !!m.alt, shiftKey: !!m.shift, metaKey: false }, ctx, scope)
    return ran
  }

  it('keep the keys that the keymap leaves alone', () => {
    expect(pressed('P', { shift: true })).toEqual(['commandPalette'])
    expect(pressed('v', { alt: true })).toEqual(['togglePdf'])
    expect(pressed('Tab', { shift: true })).toEqual(['cycleTabs(-1)'])
    expect(pressed('ArrowLeft', { alt: true, ctrl: false })).toEqual(['goBack'])
    expect(pressed('b', {}, 'editor')).toEqual(['edit(bold)'])
  })

  it('bind the VS Code keys: Ctrl+Shift+F finds in the vault (Ctrl+Shift+H too), Ctrl+Shift+B recompiles', () => {
    expect(pressed('F', { shift: true })).toEqual(['findInVault'])
    expect(pressed('H', { shift: true })).toEqual(['findInVault'])
    expect(pressed('B', { shift: true })).toEqual(['recompile'])
  })

  it('move figure to Ctrl+Alt+F, the sidebar to Ctrl+Alt+B, and give figure* no key', () => {
    expect(pressed('f', { alt: true }, 'editor')).toEqual(['edit(figure)'])
    expect(pressed('b', { alt: true })).toEqual(['toggleSidebar'])
    expect(registry().reg.get('insert.figureStar')?.key).toBeUndefined()
  })

  it('open Appearance on Ctrl+, and save on Ctrl+S', () => {
    expect(pressed(',')).toEqual(['appearance'])
    expect(pressed('s')).toEqual(['save'])
  })

  it('give no two commands the same key in the same place', () => {
    const seen = new Set<string>()
    for (const c of registry().reg.all()) {
      for (const key of [c.key, ...(c.aliases ?? [])]) {
        if (!key) continue
        const k = `${c.editorKey ? 'editor' : 'app'} ${key}`
        expect(seen.has(k), k).toBe(false)
        seen.add(k)
      }
    }
  })

  /** A registry whose actions all return `value`, as App's one-liners can (`sideOpen = !sideOpen` is false when closing). */
  const returning = (value: unknown) => {
    const actions = new Proxy({} as CoreActions, { get: () => () => value })
    const reg = new CommandRegistry()
    reg.register(...coreCommands(actions))
    return reg
  }
  const key = (k: string, m: { shift?: boolean; alt?: boolean } = {}) => ({ key: k, ctrlKey: true, altKey: !!m.alt, shiftKey: !!m.shift, metaKey: false })

  it.each([false, '', null, 0])('count an always-applies action as applied whatever it returns (%j)', (value) => {
    const reg = returning(value)
    expect(reg.handleKey(key('b', { alt: true }), TEX, 'app')).toBe(true)
    expect(reg.run('view.togglePanel', TEX)).toBe(true)
  })

  it('let Ctrl+W fall through when there is no tab to close', () => {
    expect(returning(false).handleKey(key('w'), TEX, 'app')).toBe(false)
    expect(returning(true).handleKey(key('w'), TEX, 'app')).toBe(true)
  })

  it('say "Open a .tex file to cite" for Ctrl+Shift+C outside a .tex file', () => {
    const hints: string[] = []
    const reg = new CommandRegistry(undefined, (h) => hints.push(h))
    reg.register(...coreCommands(recorder().actions))
    expect(reg.handleKey(key('C', { shift: true }), BIB, 'app')).toBe(true)
    expect(hints).toEqual(['Open a .tex file to cite'])
  })

  it('hide Live View with no file open', () => {
    expect(labels({ vault: true, editor: false, tex: false })).not.toContain('View: Live View')
    expect(labels(BIB)).toContain('View: Live View')
  })

  it('open the Getting-started vault from Help, with or without a vault open', () => {
    expect(labels(NONE)).toContain('Help: Getting Started')
    expect(labels(TEX)).toContain('Help: Getting Started')
    const { reg, ran } = registry()
    reg.run('help.gettingStarted', NONE)
    expect(ran).toEqual(['gettingStarted'])
  })
})

describe('the empty editor', () => {
  it('lists the main keys from the registry, as a .tex file would run them', () => {
    const { reg } = registry()
    expect(emptyPlateKeys(reg, false)).toEqual([
      { id: 'tools.commandPalette', key: 'Ctrl+Shift+P', title: 'Run Command' },
      { id: 'file.goToFile', key: 'Ctrl+P', title: 'Go to File' },
      { id: 'file.newFile', key: 'Ctrl+N', title: 'New File' },
      { id: 'file.save', key: 'Ctrl+S', title: 'Save and Build' },
      { id: 'edit.findInVault', key: 'Ctrl+Shift+F', title: 'Find in Vault' },
    ])
  })

  it("follows a command's key when it changes, and leaves out one without a key", () => {
    const { reg } = registry()
    reg.get('file.goToFile')!.key = 'Mod-e'
    delete reg.get('file.newFile')!.key
    const keys = emptyPlateKeys(reg, false)
    expect(keys.find((k) => k.id === 'file.goToFile')?.key).toBe('Ctrl+E')
    expect(keys.map((k) => k.id)).not.toContain('file.newFile')
  })
})
