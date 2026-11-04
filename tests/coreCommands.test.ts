import { describe, expect, it } from 'vitest'
import { CommandRegistry, paletteLabel, searchCommands, type Context } from '../src/renderer/src/lib/commands'
import { coreCommands, type CoreActions } from '../src/renderer/src/lib/coreCommands'

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

const NONE: Context = { vault: false, tex: false }
const BIB: Context = { vault: true, tex: false }
const TEX: Context = { vault: true, tex: true }
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
})
