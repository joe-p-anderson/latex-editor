# Plugins

A plugin is an optional feature that ships with endleaf and can be switched on or off for each vault, for example the Symbols palette, a problem bank, or a link to Zotero. Plugins are built in: they are written with the app and bundled by electron-vite. There is no sandbox and nothing is loaded at runtime. The manifest and the contexts below are designed so that third-party loading could be added later without changing them.

## Switching plugins on

| Where | What | Stored in |
|---|---|---|
| This vault | on, off, or "follow the default" | `.vault.json`: `"plugins": { "<id>": true \| false \| { "enabled"?, "settings"? } }` |
| New vaults (the default) | on or off | `settings.json`: `"plugins": { "<id>": { "enabled"?, "settings"? } }` |
| The plugin's own default | `defaultEnabled` in its manifest | code |

- A plugin is on if the vault says so. Otherwise it follows `settings.json`, and failing that the manifest. This is `resolveEnabled()` in `src/shared/plugin.ts`.
- **Vault settings** travel with the vault, e.g. where the problem bank lives. **Global settings** belong to this install, e.g. the Zotero port.
- The **Plugins** view (the puzzle icon at the foot of the activity bar, or Tools → Plugins…) has:
  - each plugin's switch for this vault;
  - "On for new vaults";
  - its settings, as forms generated from the manifest;
  - anything the plugin adds there itself, such as a setup checklist.
- Switching applies at once in both processes, with no reload.

## Layout

```
src/plugins/
  manifests.ts          every plugin's manifest, in panel order
  main.ts               id → main-process half (plugins that have one)
  renderer.ts           id → renderer half (plugins that have one)
  <id>/
    manifest.ts         pure data; imported by both processes
    main.ts, main/      main-process half: Node, files, network, build hooks
    renderer.ts, ui/    renderer half: views, commands, editor extensions (Svelte)
    *.ts                anything else must be pure (no Node, no DOM): both processes may import it
```

- The tsconfigs enforce the split. `tsconfig.node.json` excludes `renderer.ts` and `ui/`, and `tsconfig.web.json` excludes `main.ts` and `main/`.
- Types both halves use, such as the shape of an index the main half serves, belong in a pure module. The renderer half can't import from `main.ts`.
- State shared by a plugin's view and its commands goes in a rune module, `ui/store.svelte.ts`. It is renderer-only, and the problem bank does this.
- Pure logic that both halves need, or that unit tests reach, can also go in `src/shared/`.
- `@shared/…` resolves in both processes and in tests. Imports of the engine's own types use relative paths, such as `../../main/plugins` and `../../renderer/src/lib/plugins.svelte`.
- Adding a plugin means writing its folder and adding a line to `manifests.ts`, plus `main.ts` and/or `renderer.ts` beside it.

## Manifest

```ts
// src/plugins/<id>/manifest.ts
import type { PluginManifest } from '../../shared/plugin'
export default {
  id: 'problem-bank',              // lower-case, dashed; its folder and its settings key
  name: 'Problem bank',
  description: 'One or two sentences for the Plugins panel.',
  icon: 'book',                    // a name from src/renderer/src/lib/icons.ts, or 24×24 stroked SVG markup
  defaultEnabled: false,
  when: { vaultHas: '**/*.bib' },  // optional: when its *contextual* views show (vaultHas, fileIs globs)
  settings: {
    vault: [{ key: 'bank', label: 'Bank folder', type: 'vaultDir', default: 'Problems' }],
    global: [{ key: 'library', label: 'Shared library', type: 'path', default: '' }],
  },
  links: ['https://www.zotero.org/download/'],  // optional: https pages ctx.openLink may open
} satisfies PluginManifest
```

- The setting types are `bool`, `string`, `path`, `vaultFile`, `vaultDir` (relative, kept inside the vault), `enum` (`options`) and `number` (`min`, `max`).
- Stored values are checked against the fields. Unknown keys are dropped, and invalid values fall back to the default.

## Main half: `MainContext` (`src/main/plugins.ts`)

```ts
import type { PluginMain } from '../../main/plugins'
const main: PluginMain = async (ctx) => { … }
export default main
```

| Member | What it does |
|---|---|
| `ctx.vault` | `root`, `name`, `abs(rel)`, `rel(abs)`, `read`, `readOptional`, `write` (makes folders), `files()`, `onFile((event, rel) => …)` for add, change and unlink |
| `ctx.settings` | `global()`, `vault()` (current values, defaults filled in), `setGlobal`, `setVault`, `onChange(f)` |
| `ctx.cacheDir` | `<vault>/.texcache/plugins/<id>`. Never shown in the file tree; holds indexes and scratch builds. |
| `ctx.handle(name, fn)` | Answers `ctx.invoke(name, …args)` from the renderer half. Arguments and results must be structured-cloneable. |
| `ctx.emit(event, data)` | Delivered to the renderer half's `ctx.on(event, …)`. |
| `ctx.build.before(f)` | Runs before a build's first pass, with `{ kind: 'full' \| 'draft' \| 'section', vault, root, cacheDir, name, buffers }`. It may write files the build reads. |
| `ctx.build.after(f)` | Runs after a build is diagnosed, with the above plus `auxPath` and `result`. It may return extra `Problem`s. |
| `ctx.build.fixes(f)` | `(problem, build) => QuickFix[]`: extra fixes for any problem, e.g. "Add from Zotero" on an undefined citation. `build` has `kind`, `root`, `name`, `cacheDir`, `auxPath` and `result`. A fix that only appends to a file that doesn't exist creates the file. |
| `ctx.build.scratch(name, source)` | Compiles a generated document in `cacheDir` from the vault root, so the vault's classes and images resolve. It runs alongside any document build, doesn't cancel it, and publishes nothing. Returns a `CompileResult`. |
| `ctx.onDispose(f)` | Cleanup on switch-off. Registrations made through `ctx` are undone automatically. |

A hook that throws is logged and skipped. It never fails the build.

## Renderer half: `RendererContext` (`src/renderer/src/lib/plugins.svelte.ts`)

```ts
import type { PluginRenderer } from '../../renderer/src/lib/plugins.svelte'
const renderer: PluginRenderer = (ctx) => { … }
export default renderer
```

| Member | What it does |
|---|---|
| `ctx.views.add({ id, tip, component, icon?, contextual? })` | A sidebar view. Its icon goes in the activity bar, or under "tools" when `contextual`, shown only while `manifest.when` holds. The component gets `{ ctx, visible, docKey }`. `docKey` changes when the open file, its build or the vault's files change, so use it to refresh. Views stay mounted while the plugin is on. |
| `ctx.commands.add({ id, title, run, key? })` | Listed in **Tools** under the plugin's name and in the command palette (Ctrl+Shift+P). `key` is a CodeMirror key (`"Mod-Alt-q"`) and works while the editor has focus. `ctx.commands.run(id)` runs one. |
| `ctx.status.item({ text, tip?, onclick? })` | A status bar item; it returns `{ set(change) }`. |
| `ctx.editor` | `file()`, `text()`, `cursor()`, `selection()`, `insert`, `insertBlock`, `replace(from, to, text)`, `applyTo(rel, changes)`, `textOf(rel)`, `focus()`, `math()` (the open document's MathJax renderer). It also has `extension(ext)`, a CodeMirror extension in every editor. Offsets count a line break as one character. |
| `ctx.live.decorations((state, file) => Range<Decoration>[])` | Decorations shown only in the live view. They are recomputed when the text, the viewport or the mode changes. It returns `{ refresh() }`: call it when something else the function reads changes, such as the plugin's index. Otherwise open files keep stale decorations until the next edit. |
| `ctx.cite.source({ label, search(q), pick(hit) })` | The cite picker searches it as you type, below the document's own entries. `pick` makes the hit citable (e.g. appends it to the `.bib`) and returns its key. |
| `ctx.panel(component)` | Content under the plugin's entry in the Plugins panel (gets `{ ctx }`). It shows when the entry's settings are unfolded. `ctx.showSettings()` opens the Plugins view with them unfolded, e.g. from a status item. |
| `ctx.openLink(url)` | Opens a page in the browser, if the manifest's `links` lists it (or a prefix of it). Only https. |
| `ctx.host` | `vault()`, `files()`, `root()` (the open file's document), `macros()`, `packages.ensure / missing / loaded`, `notify`, `open(rel, line?)`, `prompt({ title, initial?, hint? })` (prompts can follow one another), `cite(keys)`, `reloadBib()`, `showView(id)`. |
| `ctx.invoke<T>(name, …args)` | `Promise<T>`: calls the main half's `ctx.handle(name, …)`. A handler that throws rejects it with the error's message. |
| `ctx.settings`, `ctx.on`, `ctx.onDispose` | As in the main half. |

- `packages.ensure(['siunitx', { name: 'fontenc', options: 'T1' }])` adds only the packages the document lacks. It counts what its class loads, read from the last build's log, and it is the same helper the table editor uses. Before a document's first build it can't see what the class loads, so it may add a redundant (harmless) `\usepackage`.
- Plugin view ids are namespaced as `<plugin>:<id>`, and so are command ids.

## Rules

- **Plugins don't edit core files.** If a plugin needs something the contexts above don't give, that's an engine change. Make it in the engine, with a test, and record it in the changelog below.
- Keep the vault portable. Anything a build needs, such as a `.bib`, must be a real file in the vault, so it builds with the plugin off and on other machines. Plugin state that can be rebuilt goes in `ctx.cacheDir`.
- Never write a vault file the user didn't ask for. Writes happen in response to a command or a click, and say what they did (`ctx.host.notify`).
- Test pure logic with unit tests in `tests/`, end-to-end flows in `tests/*.e2e.ts` on `fixtures/vaults/*`, and run `npm run check`.

## Worked examples

- `src/plugins/symbols/`: renderer only. One view acts through `ctx.host`.
- `src/plugins/zotero/`: talks to an outside program from the main half. It has a provider interface, a cite source, quick fixes, a status item, and a setup checklist panel with live checks.
- `src/plugins/problem-bank/`: both halves. It has:
  - an index in the main half, kept current with `ctx.vault.onFile` and cached in `ctx.cacheDir`;
  - a view and commands sharing a `ui/store.svelte.ts`;
  - scratch builds;
  - live cards refreshed when the index changes.

## Engine changelog

- **Round 0 (engine and the Symbols port).**
  - Built the contexts above.
  - Moved the Symbols panel, its worker and its assets into `src/plugins/symbols/`.
  - Gave the Tools menu plugin commands.
  - Changed from the plan:
    - one shared CodeMirror compartment holds every plugin's extensions, instead of one per plugin;
    - external cite hits are mouse-only, with no keyboard navigation yet;
    - `ctx.panel` was added for setup checklists.
  - The renderer runtime keeps its lists in `$state.raw`, because deep proxies broke removal by identity.
- **Round 1 (Problem bank, built by a Sonnet subagent).** The subagent reported no blocking gaps. Running the plugin in the app found these:
  - **Fixed:** `ctx.build.scratch` passed TeX an absolute path. TeX can't read one with a `~` (Windows short names such as `JANDER~1`), so every check failed there. The path is now vault-relative, with an e2e test, `tests/plugin.e2e.ts`. The subagent had worked around this in its own test instead of reporting it.
  - **Fixed:** a second `ctx.host.prompt` straight after the first never opened, because of a Svelte `{@const}` that read null.
  - **Fixed:** the Symbols port turned `\text{…}` into a tab followed by `ext{…}`. A shell heredoc had halved the backslash. The subagent spotted it.
  - **Added:** `ctx.live.decorations` now returns `{ refresh() }`. Before, a problem added to the bank didn't get its live card until the next edit.
  - **Added:** a command palette (Ctrl+Shift+P, and Tools → Run Command…). Commands with no key were mouse-only before.
  - **Added:** the `@shared` alias in the main process and in vitest.
- **Round 2 (Zotero, built by a Sonnet subagent with the round-1 skill).** It ran the app and drove it against the live Zotero (read-only). It reported real gaps, with one marked workaround and none hidden in tests.
  - **Added:** `ctx.openLink(url)` with a manifest `links` allow-list, checked in the main process. This replaced the plugin importing Electron's `shell`.
  - **Added:** `ctx.showSettings()`, which opens the Plugins view with the plugin's settings and panel unfolded. The status item had been landing on the folded list.
  - **Added:** applying a fix that appends to a file that doesn't exist creates the file. The quick fix had been skipped when the `.bib` was missing.
  - **Declined for now:** a `ctx.host.bibFiles()` API. The plugin reads `\bibliography{…}` itself, and one consumer isn't enough to fix the API's shape.
