// The application menu: the renderer's menu bar (generated from its command
// registry; see src/renderer/src/lib/menuBar.ts) with the native items added.
import type { MenuItemConstructorOptions } from 'electron'
import { MENU_BAR, type MenuBarMenu, type MenuLabel, type MenuNode } from '../shared/menu'

export interface NativeItems {
  /** What clicking a command's item does: send its id to the renderer. */
  send: (id: string) => () => void
  /** File → Template Folder (Show in Explorer, Change…), which the main process handles. */
  templateFolder: MenuItemConstructorOptions
  /** View → Check Spelling, a checkbox. */
  spelling: MenuItemConstructorOptions
}

const SEP: MenuItemConstructorOptions = { type: 'separator' }

function item(n: MenuNode, native: NativeItems): MenuItemConstructorOptions {
  switch (n.kind) {
    case 'separator':
      return SEP
    case 'heading':
      return { label: n.label, enabled: false }
    case 'submenu':
      return { label: n.label, submenu: n.items.map((i) => item(i, native)) }
    case 'command':
      // The renderer handles every key (so the editor keeps Ctrl+B for bold): the menu only shows it.
      return { label: n.label, enabled: n.enabled, ...(n.accelerator ? { accelerator: n.accelerator, registerAccelerator: false } : {}), click: native.send(n.id) }
  }
}

/** The menu template for `bar` (null before the renderer has sent one). */
export function menuTemplate(bar: MenuBarMenu[] | null, native: NativeItems): MenuItemConstructorOptions[] {
  const items = (label: MenuLabel) => (bar?.find((m) => m.label === label)?.items ?? []).map((n) => item(n, native))
  /** `a`, `b`, … joined by separators, leaving out the empty ones. */
  const sections = (...parts: MenuItemConstructorOptions[][]) => parts.filter((p) => p.length).flatMap((p, i) => (i ? [SEP, ...p] : p))
  const withNative: Partial<Record<MenuLabel, MenuItemConstructorOptions[]>> = {
    File: sections(items('File'), [native.templateFolder], [{ role: 'quit' }]),
    Edit: sections([{ role: 'undo' }, { role: 'redo' }], [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }], items('Edit')),
    View: sections([native.spelling], items('View'), [{ role: 'reload' }, { role: 'toggleDevTools' }], [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }]),
  }
  return MENU_BAR.map((label) => {
    const submenu = withNative[label] ?? items(label)
    return { label, submenu: submenu.length ? submenu : [{ label: 'Nothing here yet', enabled: false }] }
  })
}
