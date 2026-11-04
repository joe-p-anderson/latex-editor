# Keymap and menus from the registry

Status: resolved
Blocked by: 01

Spec: [../spec.md](../spec.md#keymap) (Keymap and Menus sections).

## What to build

1. **Rebind keys** as in the spec's keymap table:
   - Ctrl+Shift+F becomes Find in Vault, with Ctrl+Shift+H kept as an alias.
   - Ctrl+Shift+B becomes Build: Recompile.
   - Ctrl+Alt+F becomes Insert figure, and `figure*` loses its key.
   - Ctrl+Alt+B becomes Toggle Sidebar.
   - Ctrl+, opens Appearance (today's gear panel until ticket 06 merges the panels).
   - Ctrl+B stays bold.
2. **Generate the menu bar** from the registry: File · Edit · Insert · View · Build · Tools · Help.
   - The renderer sends the tree to the main process over IPC, replacing the hand-written menu in `src/main/index.ts` (around lines 454–545) except for native-only items (Quit, clipboard roles, Template Folder, Check Spelling if it is main-side).
   - File gains Save (Ctrl+S), labelled "Save and Build" when the active file is `.tex`.
   - Insert holds the Format submenu (bold, italic, emphasis), maths, environments, figure, table, image, cite and symbols, moved out of Edit.
   - Help can hold placeholder items until the onboarding Help ticket fills it.
   - Menu items are enabled or disabled from each command's `when`.
3. **Update in-app hints** that name old keys: tooltips, the empty PDF pane, the empty editor and the Math Shortcuts list.

## Acceptance

- [x] Ctrl+Shift+F opens vault search from the editor, the tree and the PDF.
- [x] Ctrl+Shift+B builds the active document without saving it.
- [x] Ctrl+Alt+F inserts a figure, and Ctrl+Alt+B toggles the sidebar.
- [x] Every command with a key shows that key in its menu item and in the palette.
- [x] Build → Recompile shows Ctrl+Shift+B. File → Save shows Ctrl+S.
- [x] No tooltip or hint text names a key that no longer does that thing (grep for `Ctrl+Shift+F`, `Ctrl+Shift+B` and `Mod-Shift-f`).

## Comments

Done on `ux-fixes-02`.

- Keys rebound in `coreCommands.ts`. `Command.aliases` adds extra keys (Ctrl+Shift+H for Find in Vault) that run it but aren't shown. New `file.save` (Ctrl+S, app-wide; the editor's own Mod-s binding is gone).
- The menu bar is generated: `src/renderer/src/lib/menuBar.ts` builds it from the registry (types in `src/shared/menu.ts`), App.svelte sends it over `menu:set` on any registry change and whenever the vault or active file changes, and `src/main/menu.ts` adds the native items. The old `plugins:menu`/`setPluginMenu`/`plugin-command` path is gone, since plugin commands are in the registry. New `Command` fields: `submenu` (Insert → Format), `menuTitle(ctx)` ("Save and Build" for .tex) and `menu: false` (Ctrl+Tab cycling; spelling, which stays the native checkbox).
- Help holds a disabled "Nothing here yet" until the onboarding Help ticket adds commands with `category: 'Help'`. There's no symbols command to put in Insert yet.
- Hints updated: empty editor plate, PDF pane, Problems panel, search tooltips, README keymap, IDEAS.md. The Math Shortcuts file template names no keys.
- Checked in the app over CDP: the main process's application menu (dumped through the main inspector) has the seven menus with each key, Save and Build for a .tex file, Insert items disabled with no .tex open; Ctrl+Shift+F from editor, tree and after clicking the PDF; Ctrl+Shift+H; Ctrl+Alt+F; Ctrl+Alt+B; Ctrl+,; Ctrl+Shift+B builds and leaves the file unsaved; Ctrl+S saves.
- For a human: look at the title bar's menus as they pop up (rendering, the Insert → Format submenu, the greyed Zotero heading in Tools). The title bar now has seven menu buttons, so check it still fits at narrow widths.
