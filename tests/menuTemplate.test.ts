import { describe, expect, it } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { menuTemplate } from '../src/main/menu'
import { MENU_BAR, type MenuBarMenu } from '../src/shared/menu'

const sent: string[] = []
const native = {
  send: (id: string) => () => void sent.push(id),
  templateFolder: { label: 'Template Folder' },
  spelling: { label: 'Check Spelling', type: 'checkbox' as const },
}
const empty: MenuBarMenu[] = MENU_BAR.map((label) => ({ label, items: [] }))
const sub = (t: MenuItemConstructorOptions[], label: string) => t.find((m) => m.label === label)!.submenu as MenuItemConstructorOptions[]

describe('the application menu', () => {
  it('has the seven menus before the renderer has sent any commands', () => {
    expect(menuTemplate(null, native).map((m) => m.label)).toEqual([...MENU_BAR])
  })

  it('keeps the native items: clipboard roles first in Edit, Template Folder and Quit last in File, the spelling checkbox in View', () => {
    const t = menuTemplate(empty, native)
    expect(sub(t, 'Edit').slice(0, 2).map((i) => i.role)).toEqual(['undo', 'redo'])
    expect(sub(t, 'Edit').some((i) => i.role === 'paste')).toBe(true)
    expect(sub(t, 'File').at(-1)?.role).toBe('quit')
    expect(sub(t, 'File').some((i) => i.label === 'Template Folder')).toBe(true)
    expect(sub(t, 'View').some((i) => i.label === 'Check Spelling')).toBe(true)
  })

  it("turns a command into an item that shows its key, leaves the key to the renderer, and sends the command's id", () => {
    const bar = empty.map((m) =>
      m.label === 'Build'
        ? { ...m, items: [{ kind: 'command' as const, id: 'build.recompile', label: 'Recompile', accelerator: 'Ctrl+Shift+B', enabled: false }] }
        : m,
    )
    const recompile = sub(menuTemplate(bar, native), 'Build')[0]
    expect(recompile).toMatchObject({ label: 'Recompile', accelerator: 'Ctrl+Shift+B', registerAccelerator: false, enabled: false })
    ;(recompile.click as () => void)()
    expect(sent).toContain('build.recompile')
  })

  it('makes submenus, separators and headings', () => {
    const bar = empty.map((m) =>
      m.label === 'Insert'
        ? {
            ...m,
            items: [
              { kind: 'submenu' as const, label: 'Format', items: [{ kind: 'command' as const, id: 'insert.bold', label: 'Bold', enabled: true }] },
              { kind: 'separator' as const },
              { kind: 'heading' as const, label: 'Zotero' },
            ],
          }
        : m,
    )
    const insert = sub(menuTemplate(bar, native), 'Insert')
    expect((insert[0].submenu as MenuItemConstructorOptions[])[0].label).toBe('Bold')
    expect(insert[1].type).toBe('separator')
    expect(insert[2]).toMatchObject({ label: 'Zotero', enabled: false })
  })

  it('never leaves a menu empty', () => {
    expect(sub(menuTemplate(empty, native), 'Help').length).toBeGreaterThan(0)
  })
})
