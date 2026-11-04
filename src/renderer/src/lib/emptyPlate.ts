// What the empty editor (vault open, no file) offers: the main keys, read
// from the command registry so they follow the registry when a key changes.
import { keyLabel, type CommandRegistry, type Context } from './commands'

/** The commands the empty editor lists, in order. */
export const EMPTY_PLATE_COMMANDS = ['tools.commandPalette', 'file.goToFile', 'file.newFile', 'file.save', 'edit.findInVault']

/** The empty editor's links, by command id (Help → Keyboard Shortcuts, Help → Getting Started). */
export const EMPTY_PLATE_LINKS = [
  { id: 'help.keyboardShortcuts', label: 'Keyboard Shortcuts' },
  { id: 'help.gettingStarted', label: 'Getting Started' },
]

export interface PlateKey {
  id: string
  /** For people: "Ctrl+Shift+P". */
  key: string
  title: string
}

/**
 * The empty editor's key list: each of its commands that is registered and
 * has a key. Titles are as a .tex file would run them ("Save and Build"),
 * since that's what the keys do once a file is open; `build` is whether
 * anything can build (without TeX, Ctrl+S just saves).
 */
export function emptyPlateKeys(registry: CommandRegistry, { build, mac }: { build: boolean; mac?: boolean }): PlateKey[] {
  const tex: Context = { vault: true, editor: true, tex: true, build }
  return EMPTY_PLATE_COMMANDS.flatMap((id) => {
    const c = registry.get(id)
    if (!c?.key) return []
    const title = (c.menuTitle?.(tex) ?? c.title).replace(/…$/, '')
    return [{ id, key: keyLabel(c.key, mac), title }]
  })
}
