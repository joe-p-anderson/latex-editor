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
- Pure logic that both halves need, or that unit tests reach, can also go in `src/shared/`.
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
| `ctx.build.fixes(f)` | `(problem, build) => QuickFix[]`: extra fixes for any problem, e.g. "Add from Zotero" on an undefined citation. |
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
| `ctx.commands.add({ id, title, run, key? })` | Listed in **Tools** under the plugin's name. `key` is a CodeMirror key (`"Mod-Alt-q"`) and works while the editor has focus. `ctx.commands.run(id)` runs one. |
| `ctx.status.item({ text, tip?, onclick? })` | A status bar item; it returns `{ set(change) }`. |
| `ctx.editor` | `file()`, `text()`, `cursor()`, `selection()`, `insert`, `insertBlock`, `replace(from, to, text)`, `applyTo(rel, changes)`, `textOf(rel)`, `focus()`, `math()` (the open document's MathJax renderer). It also has `extension(ext)`, a CodeMirror extension in every editor. Offsets count a line break as one character. |
| `ctx.live.decorations((state, file) => Range<Decoration>[])` | Decorations shown only in the live view, recomputed when the text, the viewport or the mode changes. |
| `ctx.cite.source({ label, search(q), pick(hit) })` | The cite picker searches it as you type, below the document's own entries. `pick` makes the hit citable (e.g. appends it to the `.bib`) and returns its key. |
| `ctx.panel(component)` | Content under the plugin's entry in the Plugins panel (gets `{ ctx }`). |
| `ctx.host` | `vault()`, `files()`, `root()` (the open file's document), `macros()`, `packages.ensure / missing / loaded`, `notify`, `open(rel, line?)`, `prompt({ title, initial?, hint? })`, `cite(keys)`, `reloadBib()`, `showView(id)`. |
| `ctx.settings`, `ctx.invoke`, `ctx.on`, `ctx.onDispose` | As in the main half. |

- `packages.ensure(['siunitx', { name: 'fontenc', options: 'T1' }])` adds only the packages the document lacks. It counts what its class loads, read from the last build's log, and it is the same helper the table editor uses.
- Plugin view ids are namespaced as `<plugin>:<id>`, and so are command ids.

## Rules

- **Plugins don't edit core files.** If a plugin needs something the contexts above don't give, that's an engine change. Make it in the engine, with a test, and record it in the changelog below.
- Keep the vault portable. Anything a build needs, such as a `.bib`, must be a real file in the vault, so it builds with the plugin off and on other machines. Plugin state that can be rebuilt goes in `ctx.cacheDir`.
- Never write a vault file the user didn't ask for. Writes happen in response to a command or a click, and say what they did (`ctx.host.notify`).
- Test pure logic with unit tests in `tests/`, end-to-end flows in `tests/*.e2e.ts` on `fixtures/vaults/*`, and run `npm run check`.

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
