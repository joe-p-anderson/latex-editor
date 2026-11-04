// The menu bar the renderer builds from its command registry and sends to
// the main process, which adds the native items (Quit, clipboard roles,
// Template Folder, the spelling checkbox) and makes it the application menu.

export const MENU_BAR = ['File', 'Edit', 'Insert', 'View', 'Build', 'Tools', 'Help'] as const
export type MenuLabel = (typeof MENU_BAR)[number]

export type MenuNode =
  /** Clicking it sends the command id back to the renderer. `accelerator` is shown only; the renderer handles the key. */
  | { kind: 'command'; id: string; label: string; accelerator?: string; enabled: boolean }
  | { kind: 'separator' }
  /** A greyed-out label over a group, such as a plugin's name. */
  | { kind: 'heading'; label: string }
  | { kind: 'submenu'; label: string; items: MenuNode[] }

export interface MenuBarMenu {
  label: MenuLabel
  items: MenuNode[]
}
