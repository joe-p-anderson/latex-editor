# endleaf: UI redesign

The app is being renamed **endleaf**. An endleaf is a bookbinding term: the endpaper glued inside a book's cover. The leaf on the ground stands for local and stable, in contrast to Overleaf. The redesign keeps a VS Code-style workbench and dresses it as a bound book, with the marbled endpaper as the signature motif.

Everything here was settled over seven rounds of mockups. The interactive mockup is the reference for anything this document doesn't spell out.

- **Mockup:** `docs/design/endleaf-mockup.html`. Open it in a browser. Rebuild it after editing `endleaf-mockup.src.html` with `node docs/design/build-mockup.mjs`. The published copy is at <https://claude.ai/artifact/47u9o3iJkwDEJzbzsu4Ygx>.
- **Palettes and logo:** `endleaf-marbled-themes/` (`themes.json` and `icons/`). These are the logo palettes; the UI derives its colours from them as described below.
- The mockup's bar at the top only switches screens. Every real setting is in the in-app **Appearance** panel (the gear).

## Settings

The theme builder is the **Appearance** sidebar view. It opens from the gear at the foot of the activity bar, the vault swatch above it, or the vault name in the status bar.

| Setting | Values | Default | Scope | Stored in |
|---|---|---|---|---|
| Look | Plain, Bench | Plain | global | `settings.json` |
| Page | the palette's paper stock, Black | Black | global | `settings.json` |
| Desk (Bench only) | Felt, Leather pad | Felt | global | `settings.json` |
| Binding (Bench only) | Saddle leather, Linen; Black pages force dark leather | Saddle leather | global | `settings.json` |
| File tabs (Bench only) | Left edge, Top edge | Left edge | global | `settings.json` |
| Line length | 60–96 characters | 82 | global | `settings.json` |
| Text size | 17–21 px | 19 | global | `settings.json` |
| Typeface | Crimson Pro, Libre Caslon Text, Old Standard TT, EB Garamond | Crimson Pro | global | `settings.json` |
| Palette | the six in `themes.json` | Bookbinder's Blue | per vault | `.vault.json` |
| Marbling | stone, combed, nonpareil, fan, bouquet, spanish, peacock | combed ("Bold comb") | per vault | `.vault.json` |
| Tone | Rich (the palette's `dark` marbling), Pale (`light`) | Rich | per vault | `.vault.json` |
| Seed | an integer; "Remarble" picks a new one | fixed per vault | per vault | `.vault.json` |

- `settings.json` is `src/main/settings.ts` (`AppSettings`); `.vault.json` is `src/main/vault.ts` (`VaultSettings`).
- The mockup keeps Tone as a global setting. It belongs with the vault's endpaper, so store it per vault.
- There is no ambience or lighting setting; it is always "day". There is no separate light/dark mode either: the Page setting is the dark mode.
- The panel has a **Defaults** button that restores the defaults above.

## Colour

### Paper stock and print accent (per palette)

Each palette picks its paper the way you'd pick paper for an edition. The texture is a faint neutral grain blended `soft-light` over the paper colour, so it scrolls with the page.

| Palette | Paper name | Paper | Ink | Print accent | Black page |
|---|---|---|---|---|---|
| autumn-ember | Cream wove | `#F5EDDD` | `#2A2119` | `#9A3F22` | `#1E1915` |
| bookbinders-blue | Bright white | `#FBFAF7` | `#1C2230` | `#2F4E7E` | `#141821` |
| oxblood-gilt | Ivory laid | `#F6EFE3` | `#281C1B` | `#7E2226` | `#1C1416` |
| forest-floor | Natural | `#F3EFE2` | `#212518` | `#46602F` | `#151A15` |
| plum-amber | Soft white | `#F8F4F1` | `#261E25` | `#6E3160` | `#1A1420` |
| slate-ember | Cool white | `#F4F4F1` | `#212226` | `#A24E1E` | `#17181A` |

- **Black page:** text is `#E2DED6` (silver-white). Details use the gilt colour instead of the print accent.
- **Gilt:** the `dark`-mode `leafFoil` stop nearest offset 0.34. The full foil gradient (`linear-gradient(115deg, …stops)`) is used for active-item rules and the tab gilt line.
- **The PDF** always renders on pure white.

### Plain look tokens

The Plain look uses flat tokens derived from the palette, in the palette mode matching the Page setting. This is `plainTokens()` in the mockup:

- **Light:** page is `label`, text is `mix(#211C18, marbling[5], .14)`, side is `mix(marbling[2], label, .4)`, bar is `mix(marbling[4], marbling[1], .45)`, desk is `mix(marbling[0], marbling[4], .5)`, accent is `vein`.
- **Dark:** page is `mix(marbling[2], #fff, .045)`, text is `mix(#EDE5D8, vein, .1)`, bar is `label`, desk is `mix(label, marbling[0], .42)`, accent is `vein`.

Muted, faint, line and selection colours are mixes of these; see the function.

## Looks

The two looks share the same DOM. A `data-look` attribute on the window decides which CSS applies. Plain needs one extra element: a conventional tab bar.

### Plain

- Flat chrome in the Plain tokens, and a conventional tab bar whose active tab has a 2 px foil line on top.
- **Marbling accents:**
  - a 9 px marbled strip along the activity bar's right edge,
  - a 4 px marbled rule under the tab bar,
  - the PDF pane's background.
- The page column has the same measure and margins as Bench, with no desk, boards or riffle.

### Bench

- **Chrome:** the title bar, activity bar and status bar are bound in a material:
  - **Saddle leather:** tan; icons and text in dark brown ink with a light deboss.
  - **Linen buckram:** grey linen with dark ink.
  - **Dark leather:** forced on black pages; light tan ink, gilt for the active item.

  Icons must stay high-contrast; an early blind-stamped version was illegible.
- **Sidebar and bottom panel:** plain paper in the side tone, with the grain blend. No ruled lines.
- **Desk:** felt (`#605A53` with fine noise) or a leather pad. Both are tiled textures and scroll with the document.
- **The book:**
  - **One tall page** as long as the document, with no running header and no page numbers. The current section is shown in the status bar instead.
  - **Covers:** marbled boards show 18–20 px around the page, with a soft contact shadow on the desk.
  - **Edges:** the left edge of the page is plain; a 6 px stack of trimmed page edges shows on the right and bottom.

## The page column

- **Width:** the measure is in characters. Width = line length × the average character width of the chosen face at the chosen size, measured from real prose. The default 82 characters is about 606 px in Crimson Pro at 19 px.
- **Margins:** the inner margin is 7.5 % of the page width, clamped to 24–64 px. The outer margin is 11 %, clamped to 30–104 px.
- **Wide content:** wide tables and display maths may run into the outer margin, up to 70 px.
- **The source block under the cursor** (live view):
  - it extends into the outer margin, so typical 74–80-character source lines don't wrap,
  - its font is the mono at 0.74× the text size,
  - it has a 2 px accent rule on its left,
  - line numbers sit in the inner margin, in italic, in the faint ink colour.
- **Type:** text has a line height of 1.56, is justified, and is hyphenated.

## File tabs

**Bench, left edge (default):**
- Paper index tabs stick out of the book's left edge. They are all 138 × 30 px, and the active one is in the page's own paper.
- They stay in view (`position: sticky`) as the book scrolls.
- Hovering a tab nudges it out and shows a close ×. Middle-click closes it.
- The book is offset so the tabs have 156 px of room.

**Bench, top edge:**
- The same tabs, standing up from the head of the book. The active tab is 35 px tall; the others are 29 px.
- They are pinned at the top of the view. When the book is scrolled, the page fades out underneath them.
- With the PDF open, they span only the left page.

**Switching (Bench):**
- A riffle of 6 paper leaves, each turning for 170 ms, 38 ms apart.
- Moving to a later tab turns leaves away; moving to an earlier one brings them in.
- Skip it under `prefers-reduced-motion` and in the Plain look.
- Each file keeps its own scroll position.

**Plain:** the conventional tab bar described above.

## The PDF

**Bench:**
- Showing the PDF opens the book flat at its last page, split 60/40. Drag the gutter to resize.
- **The left page** is the editor. Its outer margin is now on the left, and the tabs stay on the left.
- **The right side** is the marbled back endpaper. The white PDF sheets lie on it, scrolling vertically and horizontally on their own.
- **Controls** sit in a small leather label pinned at the top of the endpaper, outside the scrolling area so they never move: file and page count, zoom out, Fit, zoom in, close.

**Plain:** a separate right-hand pane on the marbled endpaper, with the same controls and a draggable splitter.

**Shortcut:** Ctrl+Alt+V toggles the PDF in both looks.

## Thresholds

- **Welcome screen:** the vault's marbling fills the window, with a bookplate on top. The bookplate shows "EX · LIBRIS", the full logo, the wordmark in EB Garamond, the recent vaults (each with its own marbling chip), and Open a folder, New vault and Clone from Git. Hovering a vault previews its endpaper behind the plate.
- **No file open:** solid marbling with a small bookplate listing the main keys. There is no book, board or tabs.

## Workbench chrome

- **Frameless title bar**, 36 px:
  - the small logo, then the menus,
  - a centred running title ("vault · *file*", which opens quick open),
  - Live/Source, the PDF toggle, the panel toggle, the build note, and a silk **ribbon bookmark** that hangs below the bar to show build state (ok, building, error),
  - window controls.
- **Activity bar:** Files, Search and Symbols. Below a rule labelled "tools", contextual tools appear only when the vault needs them: Citations when there's a `.bib` file, Document parts when the root uses `\input`. The vault swatch and the gear sit at the foot.
- **Sidebar:** collapsible sections (Files and Contents). Clicking the active activity icon or pressing Ctrl+B collapses it; dragging it below 140 px closes it.
- **Bottom panel:** Problems and Log, toggled with Ctrl+J. Clicking a problem jumps to its block.
- **Status bar:** the vault (with its marbling chip), the branch, the current section, the cursor position, Live/Source, spelling, the problem count and the engine.

## Marbling engine

The patterns use Jaffer's mathematical marbling. Ink drops displace what is already on the bath; tine strokes drag it. Each pixel is traced backwards through the operations to find its colour. The engine is `bandsFn`, `marbleOps` and `renderMarble` in the mockup.

- **Operations:**
  - drop (with a vein-coloured ring),
  - straight or periodic comb,
  - sine shift,
  - vortex,
  - the fan remap (rows of overlapping scallops, with a vein outline).
- **Patterns:**
  - **stone:** 170 drops,
  - **combed:** bands, then a back-and-forth comb at 64 / 72 / 12, then a fine comb at 12 / 30 / 2.4,
  - **nonpareil:** a 32-spacing back-and-forth comb, then a 6.5 fine comb,
  - **fan:** vertical bands, then a fine comb, then the fan remap,
  - **bouquet:** nonpareil plus a grid of vortices,
  - **spanish:** larger drops plus a modulated sine shift,
  - **peacock:** nonpareil plus a sine shift along y.

  Every size scales with `k = width / 960`.
- **Quality:** each pixel averages a 2×2 supersample, plus ±3 grain. Sheets are 1800×1200 (stone 1500×1000); thumbnails are 240×150.
- **Runtime:** generate in a worker (the mockup serialises the functions into a Blob worker). In the app, cache the PNGs on disk keyed by `palette|tone|pattern|seed|size`, so each sheet renders only once. While a sheet renders, show a gradient of the palette colours.
- **Logo:** rebuilt in code exactly as the icon files are made (the stripe pattern, two turbulence displacements, the label and the foil leaf) in three tiers: full, mid and small. Use the small tier in the title bar and swatches. Alternatively use the SVGs in `endleaf-marbled-themes/icons/` directly.

## Mapping onto the current code

| Today | Becomes |
|---|---|
| `src/renderer/src/app.css`: `--bg`, `--panel`, `--accent`… | A token set set at runtime from the palette, page and look: `--paper`, `--ink`, `--ink-soft`, `--detail`, `--side`, `--chrome-*`, `--foil`, `--marbleimg`, plus the Plain `--p-*` tokens. |
| `App.svelte`: sidebar switch (`'files' \| 'search' \| 'symbols'`), editor/PDF `split` | An activity bar with views (add `theme` and the contextual tools), a resizable and collapsible sidebar, the book or editor area, and the PDF as either the book's back endpaper (Bench) or a pane (Plain). |
| `TabBar.svelte` | Fore-edge or top-edge index tabs (Bench) and the conventional tab bar (Plain), sharing one tab model. Add the riffle. |
| `Editor.svelte` + `lib/live/theme.ts` (Cambria 16 px, no measure) | The CodeMirror scroller becomes the desk. Style `.cm-content` as the page: the column width in characters, the margins above, the paper background with grain. The live source-line styles follow the source-block rules above. |
| `PdfViewer.svelte` (`--pdf-bg`) | White sheets on `--marbleimg`, with the fixed control label. Keep SyncTeX. |
| `FileTree`, `Outline`, `SearchPanel`, `SymbolPanel`, `ProblemsPanel` | Restyle on paper (Bench) or the flat side tone (Plain). Outline becomes "Contents". |
| `src/main/index.ts`: `BrowserWindow({ title: 'LaTeX Editor' })` | `frame: false` (or `titleBarStyle: 'hidden'` with `titleBarOverlay`), a custom title bar, and the endleaf name and icon. `package.json` name too. |
| `settings.ts` / `vault.ts` | Add the appearance fields from the settings table. |

## Suggested order

1. **Tokens and the Plain look.**
   - Put the token set in `app.css`.
   - Derive palette tokens at runtime from `themes.json`.
   - Add the settings plumbing (`settings.json`, `.vault.json`).
   - Build the Appearance panel.

   After this step the app looks like the Plain look, apart from the marbling.
2. **Marbling.** The worker, the disk cache, and the logo tiers. Then the marbled accents and the welcome and no-file screens.
3. **Page column.** The measure in characters, the margins and type, the live source-block styling, and line numbers in the margin.
4. **Workbench chrome.** The frameless title bar and ribbon, the activity bar views and contextual tools, and the status bar.
5. **The Bench look.**
   - Materials: chrome options, desk tiles, paper sidebars.
   - The tall book with boards and edges.
   - Fore-edge and top-edge tabs, and the riffle.
   - The open-book PDF.

## Not decided yet

- **Narrow windows:** with the sidebar and the PDF both open, the left page gets cramped. One option is to collapse the sidebar automatically when the PDF opens below some width.
- **Bench PDF scroll:** in the open book, should the PDF follow the source position (SyncTeX scroll sync), as the current split does?
- **Mockup fakes:** the symbol pad's "best matches" are canned, and search covers only the sample document. The real Detexify panel and vault search already exist and only need restyling.
