# Folder starters, and built-ins as files

Status: ready-for-agent

Spec: [../spec.md](../spec.md) (The folder format; Using a folder starter; Built-in starters as files).

## What to build

1. **Folder starters** in `src/main/starters.ts` / `src/shared/starters.ts`: read folders as well as files from each `starters/` directory, find the entry file, collect fields across all text files, fill placeholders, copy other files byte for byte, skip `.keep`.
2. **New file and New vault** (`NewFileDialog.svelte`, `App.svelte` `createFromStarter`, `src/main/newvault.ts`): create the folder's files, never overwriting. Remove `companions` and its type; nothing should still refer to it.
3. **Built-ins as files:** move every `BUILT_IN` entry to `resources/starters/`, package it in `electron-builder.yml`, and read it from the repo in development and from `process.resourcesPath` when packaged (follow how `src/main/gettingStarted.ts` finds `resources/getting-started/`). The Lab report becomes a folder with `figures/.keep`, and its `\includegraphics` path uses `figures/`.
4. **Name clash:** a user or vault starter replaces a built-in one of the same name in the list.
5. **Dialog:** mark folder starters and list their files.
6. Update GLOSSARY.md's **Starter** entry ("A file or folder a new document is created from…").

## Acceptance

- [ ] `BUILT_IN` (or any starter text) no longer exists in code; the New file dialog lists the same starters as before.
- [ ] Editing a file under `resources/starters/` and reopening the dialog in `npm run dev` shows the change.
- [ ] New vault with Lab report (revtex) creates `main.tex`, `references.bib` and `figures/`, opens `main.tex`, and builds cleanly with MiKTeX (extend the existing e2e check if there is one).
- [ ] New file with a folder starter in an existing vault creates the missing files and leaves existing ones untouched.
- [ ] A field used in two files is asked for once and filled in both.
- [ ] A folder starter in a template folder's `starters/` works the same as a built-in one.
- [ ] Unit tests cover entry-file choice, field collection, `.keep`, binary copy and no-overwrite.
