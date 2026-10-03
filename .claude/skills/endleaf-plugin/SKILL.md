---
name: endleaf-plugin
description: Build or change a built-in endleaf plugin (an optional feature switched on per vault, under src/plugins/<id>/), e.g. the problem bank or Zotero. Use when writing a plugin's manifest, main or renderer half, its views, commands, build hooks or settings. Not for Claude Code plugins.
---

# Writing an endleaf plugin

endleaf is an Electron + Svelte 5 + CodeMirror 6 LaTeX editor. Plugins are optional features that ship with the app. Each is a folder in `src/plugins/<id>/` that the engine starts and stops as the user switches it on or off for a vault.

**Read `docs/design/PLUGINS.md` first.** It is the API reference: the manifest, `MainContext`, `RendererContext`, the rules and the engine changelog. Read `src/plugins/symbols/` as a worked example of a renderer-only plugin.

## The hard rule

Only touch:
- `src/plugins/<your-id>/`;
- the one-line registrations in `src/plugins/manifests.ts`, `src/plugins/main.ts` and `src/plugins/renderer.ts`;
- your plugin's pure modules in `src/shared/` (new files only);
- tests in `tests/`;
- docs in `docs/plugins/<id>.md`.

**Don't edit engine or core files.** That means `src/main/*`, `src/renderer/src/*` (except importing from them), `src/preload/*`, `src/shared/api.ts`, `src/shared/plugin.ts`, and existing shared modules.

When the engine can't do something you need:
1. Write the smallest workaround inside your plugin, marked `// ENGINE-GAP: <what's missing>`. If no workaround is possible, leave the feature out.
2. Add it to the **Engine gaps** list in your final report. Say what you needed, why, and the API you'd want.

Engine changes are made by the reviewer, who then removes the workaround.

## Steps

1. **Manifest** (`manifest.ts`): pure data, `satisfies PluginManifest`. Choose `defaultEnabled` (usually `false` for anything vault-specific), the settings (vault versus global), and `when` if its view is contextual.
2. **Pure logic first**, in plain `.ts` modules with no Node and no DOM imports: parsers, formatters, index builders. Unit-test them in `tests/<id>.test.ts` with vitest (`npm test`). Most of a plugin's correctness lives here.
3. **Main half** (`main.ts`), if you need files, the network, build hooks or scratch builds. Register everything through `ctx`. Expose operations with `ctx.handle(name, fn)`, using plain-data arguments and results.
4. **Renderer half** (`renderer.ts` plus `ui/*.svelte`): views (`ctx.views.add`), commands (`ctx.commands.add`), status items, live decorations, cite sources, and a Plugins-panel component (`ctx.panel`). Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`).
5. **Register** it in `src/plugins/manifests.ts`, `main.ts` and `renderer.ts`.
6. **Check:** `npm run check` (svelte-check plus tsc for both halves; both must be clean) and `npm test`. Add an e2e test (`tests/<id>.e2e.ts`, `npm run test:e2e`, needs pdflatex) for anything that builds.

## Conventions this codebase holds to

- Comments and UI text are in plain, short sentences. User-facing strings say what happened ("Added 3 problems to HW4.tex").
- Match the surrounding style: no semicolons, single quotes, 2-space indent, `const` arrow helpers. A short doc comment on each export; no comment noise.
- Paths called `rel` are vault-relative with forward slashes; `abs` paths are absolute.
- Styles: use the CSS tokens (`--paper`, `--ink`, `--ink-soft`, `--detail`, `--line`, `--side`, `--sel`, `--f-ui`, `--f-page`). Copy the panel look from `src/renderer/src/lib/PluginsPanel.svelte` or `AppearancePanel.svelte` (11px uppercase section heads, 12px soft help text).
- Never write a vault file without the user asking (a command or a click). Rebuildable state goes in `ctx.cacheDir`.
- Line endings: files may be CRLF. Use `normalizeEol` from `@shared/search` before parsing. `ctx.editor` offsets count a line break as one character.
- Reuse what exists before writing your own:
  - `src/shared/latexedit.ts`: outline, `blankComments`, list markers;
  - `src/shared/project.ts` and `src/main/scan.ts`: include graphs;
  - `src/shared/paperedit.ts`: extract and move blocks;
  - `src/shared/mathrender.ts`: math previews (or `ctx.editor.math()`);
  - `src/shared/bibtex.ts`.

## Final report format

1. What you built: files, commands, views and settings.
2. How you tested it: commands run and their results.
3. **Engine gaps**: each one with the `ENGINE-GAP` workaround's location, or "none".
4. Anything in the task you left out, and why.

## Lessons

(Filled in after each plugin round: what subagents missed, misread or over-built.)
