---
name: endleaf-plugin
description: Build or change a built-in endleaf plugin (an optional feature switched on per vault, under src/plugins/<id>/), e.g. the problem bank or Zotero. Use when writing a plugin's manifest, main or renderer half, its views, commands, build hooks or settings. Not for Claude Code plugins.
---

# Writing an endleaf plugin

endleaf is an Electron + Svelte 5 + CodeMirror 6 LaTeX editor. Plugins are optional features that ship with the app. Each is a folder in `src/plugins/<id>/` that the engine starts and stops as the user switches it on or off for a vault.

**Read `docs/design/PLUGINS.md` first.** It is the API reference: the manifest, `MainContext`, `RendererContext`, the rules and the engine changelog. The worked examples are:
- `src/plugins/symbols/`: renderer only;
- `src/plugins/problem-bank/`: both halves, an index, a view plus commands sharing a store, scratch builds and live cards.

Copy their shapes.

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

**A workaround in a test is an engine gap too.** If a test only passes because you changed the setup, report it. For example, avoiding a path the app itself would meet.

## Steps

1. **Manifest** (`manifest.ts`): pure data, `satisfies PluginManifest`. Choose `defaultEnabled` (usually `false` for anything vault-specific), the settings (vault versus global), and `when` if its view is contextual.
2. **Pure logic first**, in plain `.ts` modules with no Node and no DOM imports: parsers, formatters, index builders. Unit-test them in `tests/<id>.test.ts` with vitest (`npm test`). Most of a plugin's correctness lives here.
   - Types both halves use, such as the index the main half serves, go here too. The renderer can't import from `main.ts`.
   - `@shared/…` imports work everywhere.
3. **Main half** (`main.ts`), if you need files, the network, build hooks or scratch builds. Register everything through `ctx`. Expose operations with `ctx.handle(name, fn)`, using plain-data arguments and results.
4. **Renderer half** (`renderer.ts` plus `ui/*.svelte`): views (`ctx.views.add`), commands (`ctx.commands.add`), status items, live decorations, cite sources, and a Plugins-panel component (`ctx.panel`). Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`).
   - State a view and the commands share goes in `ui/store.svelte.ts`.
   - Live decorations that read plugin data must call the `refresh()` that `ctx.live.decorations` returns whenever that data changes.
5. **Register** it in `src/plugins/manifests.ts`, `main.ts` and `renderer.ts`.
6. **Check:** `npm run check` (svelte-check plus tsc for both halves; both must be clean) and `npm test`. Add an e2e test (`tests/<id>.e2e.ts`, `npm run test:e2e`, needs pdflatex) for anything that builds.
   - An e2e test copies a fixture vault to a temp folder; never write to `fixtures/`.
   - The 1200-latex fixture's `.vault.json` has `"templates": "../../_templates"`. Rewrite it to the absolute `fixtures/_templates` path in the copy, or its `handout` class won't be found. `tests/fixes.e2e.ts` does this.
7. **Run it in the app** (below) and use each view and command once. Tests miss bugs that appear only in the running app: prompt sequences, live widgets after data changes, path handling.

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

## Running it in the app

Use a copy of a fixture vault and a throwaway user-data folder, so the user's settings and recent vaults are untouched. Turn your plugin on in the copy's `.vault.json` (`"plugins": { "<id>": true }`).

```bash
npx electron-vite dev --remoteDebuggingPort 9233 -- --vault="$SCRATCH/vault" --user-data-dir="$SCRATCH/userdata"   # in the background
node .claude/skills/endleaf-plugin/drive.mjs evalfile steps.js   # run JS in the window
node .claude/skills/endleaf-plugin/drive.mjs shot shot.png       # then Read the PNG and look at it
```

- Activity bar buttons are `.activity .act[title="…"]`. File tree rows are `.side-body:not([hidden]) button.row`.
- The CodeMirror view is `document.querySelector('.cm-content').cmTile?.view` (older builds: `.cmView.view`).
- Run a command by sending Ctrl+Shift+P to `view.contentDOM` (`new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true })`). Then type into `[role=dialog] input` and press Enter. Prompts are `[role=dialog] input` too.
- Save with a Ctrl+S keydown on `view.contentDOM`.
- **Stopping:** stopping the background `npx` leaves Electron running and holding the port. Afterwards, find the owner of the port (`netstat -ano | grep ":9233 " | grep LISTEN`) and stop that process. Stop only that one: other sessions and the user run their own.

## Final report format

1. What you built: files, commands, views and settings.
2. How you tested it: commands run and their results.
3. **Engine gaps**: each one with the `ENGINE-GAP` workaround's location, or "none".
4. Anything in the task you left out, and why.

## Lessons

From round 1, the problem bank. It was complete and well tested, but it was never run in the app.

- **Backslashes:** write LaTeX-heavy code and tests with the Write and Edit tools, not shell heredocs, `sed` or `python -c`. The shell halves `\\` and turns `\t`, `\b` into control characters. This broke the Symbols port (`\text` became a tab).
- **Report test-only workarounds as gaps.** A test that avoided a Windows short path (`JANDER~1`) hid a scratch-build bug that broke every check in the app.
- **Run the app before reporting.** The two other bugs found in review were invisible to unit tests: a second prompt never opening, and live cards not appearing until the next edit.
- **Don't over-reach the brief.** Optional items ("only if time allows") are fine to build, but say so and keep them small.
- The skill and the docs were missing four things, all filled in above: the `@shared` alias, types shared between halves, `.svelte.ts` stores, and the fixture's templates path.

## Prompt template that worked

> Build the **<name>** plugin for endleaf. Work only in the worktree `<abs path>` (branch `<branch>`); use absolute paths. First read and follow `.claude/skills/endleaf-plugin/SKILL.md` and `docs/design/PLUGINS.md`. Don't commit.
> **What it does:** <the user's decisions, in priority order; which settings are vault versus global; what's out of scope>.
> **Done means:** check clean, unit tests for <pure logic>, an e2e test for <builds>, used once in the running app, `docs/plugins/<id>.md`, and a report in the skill's format, with feedback on the skill.
