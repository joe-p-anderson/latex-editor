# 1. One command registry drives the palette, menus, keymap and shortcut sheet

Date: 2026-11-03
Status: Accepted

## Context

A UI/UX review ([UX-REVIEW.md](../design/UX-REVIEW.md)) found that a VS Code user can't find endleaf's commands. Ctrl+Shift+P listed only plugin commands, and several shortcuts appeared in no menu.

The cause is that commands are defined in three places that don't know about each other:

- **Native menus** are in `src/main/index.ts`. Each item sends an id to the renderer, and its accelerator is display-only.
- **App-wide keys** are handled in `App.svelte`'s keydown handler.
- **LaTeX editing keys** are a CodeMirror keymap in `editing.ts`.

The command palette reads only `plugins.commands`. A shortcut sheet, an Insert menu or a fuller palette would each need yet another hand-kept list.

## Decision

The renderer holds one command registry. Each command has an id, title, category (File, Edit, Insert, View, Build, Tools, Help), an optional default key, a `when` condition, and `run`. Plugin commands register into the same registry.

Everything else is generated from it:

- the command palette, which shows only commands whose `when` holds;
- the native menus, sent to the main process over IPC in the same way plugin commands are today, with keys shown as accelerators;
- the app-wide keymap and the editor's keymap;
- the Help → Keyboard Shortcuts panel.

User-rebindable keys are out of scope for now. The default key field is where overrides would plug in later.

## Consequences

- Adding a command means one registry entry, and it automatically shows up in the palette, the menus and the shortcut sheet.
- `App.svelte`'s keydown chain and the formatting keymap in `editing.ts` become thin adapters over the registry.
- The main process no longer owns menu contents. It only builds menus from what the renderer sends, plus the few native-only items (Quit, the Edit menu's clipboard roles, Template Folder).
