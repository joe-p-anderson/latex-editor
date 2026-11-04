# Command registry and palette

Status: resolved

Spec: [../spec.md](../spec.md#command-registry). Decision: [ADR-0001](../../../docs/adr/0001-one-command-registry.md).

## What to build

A command registry in the renderer that holds every core command and every plugin command, and a command palette (Ctrl+Shift+P) generated from it.

- Each command has `id`, `title`, `category`, optional `key`, optional `when`, and `run`, as in the spec.
- Register every action that today is a menu id handled in `App.svelte` (`name === '…'` around line 960), every key in `App.svelte`'s keydown handler (around line 1188), and every formatting and insert key in `editing.ts` (around line 186). Insert commands that have no key today (`figure*` is one after ticket 02, along with image, cite and symbols) still get commands.
- Plugin commands (`plugins.svelte.ts`) register into the same registry. The palette then lists them next to core commands under Tools, prefixed with the plugin name.
- The palette shows only commands whose `when` holds, labelled `Category: Title` with the key on the right.

This ticket doesn't change any keys or menus. It only moves them into the registry and widens the palette. Ticket 02 rebinds keys and generates the menus.

## Acceptance

- [x] Ctrl+Shift+P lists the core commands, including Build: Recompile, View: Toggle PDF, View: Live View, File: New File, Edit: Find in Vault, View: Appearance, and every Insert command.
- [x] Searching "compile", "build" or "pdf" finds Build: Recompile and View: Toggle PDF.
- [x] With no vault open, vault-only commands are hidden. With a non-`.tex` file active, Insert commands are hidden.
- [x] Every existing shortcut still does what it did before, with the same key.
- [x] Plugin commands still appear and run.
- [x] Unit tests cover registration, `when` filtering and the palette's search.

## Comments

- Registry in `src/renderer/src/lib/commands.ts` (`CommandRegistry`, `keyMatches`, `keyLabel`, `paletteLabel`, `searchCommands`); core commands in `src/renderer/src/lib/coreCommands.ts`; palette is `CommandPalette.svelte`. App.svelte's keydown and the editor's formatting/insert keys (and Ctrl+Shift+L) now dispatch through the registry; editing.ts exports `EDITS` instead of a keymap. Menus send command ids (`build.recompile` etc.); menu contents unchanged. Plugin commands register under Tools with the plugin name as group.
- Checked in the running app over CDP: palette lists, search for compile/build/pdf, Insert hidden for `words.txt`, editor keys (Ctrl+B, Ctrl+Shift+E, Ctrl+Alt+F, Ctrl+Shift+F, Ctrl+M, Ctrl+Shift+L), Ctrl+Shift+B, a Zotero command from the palette.
- Small behaviour changes: Ctrl+Shift+P now works with no vault open (it lists only non-vault commands). Ctrl+Shift+C in a non-`.tex` file no longer flashes "Open a .tex file to cite", because Insert commands need a `.tex` file. File → Switch Vault's Ctrl+O is now handled by the renderer, so the menu only shows it.
- "Symbols" has no core command: the symbol panel is the `symbols` plugin.
- Not checked by eye: native menu clicks (can't click OS menus over CDP). They now send command ids, which are covered by `commands.run`.
- `tests/project.test.ts` has 3 failures on `main` too, unrelated.

