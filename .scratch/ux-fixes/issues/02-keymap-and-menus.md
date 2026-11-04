# Keymap and menus from the registry

Status: ready-for-agent
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

- [ ] Ctrl+Shift+F opens vault search from the editor, the tree and the PDF.
- [ ] Ctrl+Shift+B builds the active document without saving it.
- [ ] Ctrl+Alt+F inserts a figure, and Ctrl+Alt+B toggles the sidebar.
- [ ] Every command with a key shows that key in its menu item and in the palette.
- [ ] Build → Recompile shows Ctrl+Shift+B. File → Save shows Ctrl+S.
- [ ] No tooltip or hint text names a key that no longer does that thing (grep for `Ctrl+Shift+F`, `Ctrl+Shift+B` and `Mod-Shift-f`).

## Comments
