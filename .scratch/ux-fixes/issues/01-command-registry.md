# Command registry and palette

Status: ready-for-agent

Spec: [../spec.md](../spec.md#command-registry). Decision: [ADR-0001](../../../docs/adr/0001-one-command-registry.md).

## What to build

A command registry in the renderer that holds every core command and every plugin command, and a command palette (Ctrl+Shift+P) generated from it.

- Each command has `id`, `title`, `category`, optional `key`, optional `when`, and `run`, as in the spec.
- Register every action that today is a menu id handled in `App.svelte` (`name === '…'` around line 960), every key in `App.svelte`'s keydown handler (around line 1188), and every formatting and insert key in `editing.ts` (around line 186). Insert commands that have no key today (`figure*` is one after ticket 02, along with image, cite and symbols) still get commands.
- Plugin commands (`plugins.svelte.ts`) register into the same registry. The palette then lists them next to core commands under Tools, prefixed with the plugin name.
- The palette shows only commands whose `when` holds, labelled `Category: Title` with the key on the right.

This ticket doesn't change any keys or menus. It only moves them into the registry and widens the palette. Ticket 02 rebinds keys and generates the menus.

## Acceptance

- [ ] Ctrl+Shift+P lists the core commands, including Build: Recompile, View: Toggle PDF, View: Live View, File: New File, Edit: Find in Vault, View: Appearance, and every Insert command.
- [ ] Searching "compile", "build" or "pdf" finds Build: Recompile and View: Toggle PDF.
- [ ] With no vault open, vault-only commands are hidden. With a non-`.tex` file active, Insert commands are hidden.
- [ ] Every existing shortcut still does what it did before, with the same key.
- [ ] Plugin commands still appear and run.
- [ ] Unit tests cover registration, `when` filtering and the palette's search.

## Comments
