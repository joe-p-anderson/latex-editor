# LaTeX Editor

A local, Overleaf-style LaTeX editor that works on a folder of documents (a *vault*).

## Running

Requires Node 22+ and MiKTeX (`pdflatex` on PATH).

```bash
npm install
npm run dev
```

Pass `-- --vault=<folder>` to open a vault directly. For example, `npm run dev -- --vault=fixtures/vaults/1200-latex`. Otherwise use **File → Open Vault…** (Ctrl+O). The app remembers the last vault it opened.

`npm run check` type-checks everything.

## Testing

```bash
npm test
```

Unit tests. These cover the log parser, the source scanners, and the error diagnosis for every broken document in `fixtures/errors`. Each one declares its expected result in a `% expect:` line. They run against committed logs, so no TeX is needed.

```bash
npm run test:e2e
```

End to end, and slow because it needs MiKTeX. For each broken document, this applies the first quick fix, recompiles with pdflatex, and requires a clean build.

```bash
npm run fixtures:logs
```

Regenerates `fixtures/errors/logs/`. Run it after adding or changing a broken document.

## How a vault is laid out

```
<vault>/
  .vault.json        optional; { "templates": "<vault-only .cls/.sty folder>" }
  Homework/HW3.tex   sources, organised however you like
  Images/...         referenced relative to the vault root
  pdf/Homework/HW3.pdf      finished PDFs (mirrored tree)
  .texcache/Homework/HW3/   aux, log, synctex, working PDF (hidden)
```

- **Ctrl+S** saves the file and compiles it. A clean build is copied to `pdf/`.
- **Preview:** a pause in typing (about 1.2 s) builds your unsaved text without saving it. The PDF keeps up, and errors show as usual. The header marks this build **preview**. Nothing is written into the vault or `pdf/` until you save. The unsaved files are built from a copy in `.texcache/.shadow/`.
- **Preamble cache:** after a clean save, the document's preamble (class, packages, macros) is compiled once into a format in its cache folder. Later builds start from it, which cuts HW3 from ~1.8 s to ~1.0 s per pass. It is rebuilt when the preamble, or a class or package in the vault or a template folder, changes. If a format ever gives a different result from a plain build, it's dropped. Hover over the build status to see whether the preamble was preloaded. Turn it off with `"fastCompile": false` in `.vault.json`.
- What gets compiled:
  - a `% !TEX root = ../main.tex` comment names the document to build;
  - otherwise the file itself, if it has a `\documentclass`;
  - otherwise a multi-part paper (see below) that includes the file;
  - otherwise the document compiled last, so saving an `\input`'ed piece rebuilds its parent.
- A document in a subfolder finds its `\input` pieces in its own folder, then at the vault root.
- Classes are found through `TEXINPUTS`, so a vault holds no copies of them. See `spikes/README.md` for how that was tested. The folders searched, in order:
  1. the vault itself;
  2. the vault's own template folder, if `.vault.json` names one;
  3. the global template folder, one per install and shared by every vault. It defaults to `%APPDATA%\<app>\templates` and is set in `settings.json` beside it. Use **File → Template Folder** to open it or pick another.
- **Bibliographies:** when the document has `\bibliography{…}` (BibTeX, as with revtex or natbib) or biblatex's `\addbibresource{…}` (biber), the build runs BibTeX or biber after the first pass, then reruns pdflatex so the citations come out numbered. It only runs when something it depends on changed: the cited keys, the style, or a `.bib` file. Saves that don't touch citations cost nothing extra.
  - `.bib` files are found next to the document, then at the vault root. Styles (`.bst`) are also found in the template folders.
  - Saving a `.bib` rebuilds the document compiled last.
  - BibTeX and biber errors appear in Problems at their line in the `.bib` file. A `\cite` key that isn't in the `.bib` gets a quick fix to the closest key, e.g. a typo, or a Zotero key cut short.
- Opening a `.cls` file from the vault shows a banner offering to move it to the global template folder. **Not now** hides the banner for that file until the app restarts, so a new template can be worked on inside the vault first.

## Editing

### Live view

Files open in the **live view**, which shows the document as it reads. The source doesn't change. Ctrl+Shift+L, or the **Live / Source** button, switches the open file to plain source and back. The choice becomes the default for files opened afterwards.

- Sections are headings with their numbers. The preamble folds into one line.
- List items show their numbers and bullets: `1.`, `(a)`, `•`. Exam questions keep counting across `questions` environments, as in `handout.cls`, until `\resetquestions`. Faint tags mark where each list environment begins and ends.
- Math, `\SI`/`\qty`, figures (with their images), tables and `\includegraphics` render in place. Equations get the numbers LaTeX would give them.
- `\label` shows as a tag chip. `\ref`, `\eqref` and `\cref` show as chips with the number they refer to, or in red if the label doesn't exist. Ctrl+click a ref to jump to its label.
- `\cite` (and `\citep`, `\citet`, `\parencite`, …) shows as a chip with the numbers from the last build, `[3, 12]`, or the keys before the first build. `\citet` adds the authors, and `\citeauthor` shows only them. Hover for the reference. Ctrl+click opens the entry in its `.bib`. A key that isn't in the bibliography is red.
- `\textbf`, `\emph` and similar show their formatting. `--`, `---`, ` `` '' `, `~` and `\%` show as the characters they produce. Every space has a faint dot.
- Whatever the cursor is in shows as source again. That is the line for headings and list markers, and the whole construct for math, figures and tables. Click anything rendered to edit it.

While you type math, its preview keeps the last version that rendered, faded, instead of flashing errors for half-typed commands like `\hat{`. Errors appear once you pause.

### Keys

| Key | Does |
|---|---|
| Ctrl+B / Ctrl+I / Ctrl+E | Toggle `\textbf`, `\textit`, `\emph` around the selection. With no selection, they insert one or remove the one the cursor is in. In math, Ctrl+B uses `\boldsymbol` (which also works for Greek) and Ctrl+I gives upright `\mathrm`. They also remove an existing `\mathbf` or `\mathit` instead of nesting. Ctrl+E in math uses `\mathit`. |
| Ctrl+Shift+L | Switch between the live view and plain source |
| Ctrl+M | Toggle `$…$` |
| Ctrl+Shift+M | Put the selection in display math, `\[ … \]` |
| Ctrl+Shift+A / Ctrl+Alt+A | Put the selection in `align` / `align*` |
| Ctrl+Shift+E / Ctrl+Alt+E | Put the selection in `equation` / `equation*` |
| Ctrl+Shift+F / Ctrl+Alt+F | Insert a `figure` / `figure*` with `\centering`, `\includegraphics`, `\caption` and `\label`. The image list opens for the path, and Tab moves on to the width, caption and label. |
| Enter | In a list, starts the next `\item` (or `\question`, `\part`, …). On an empty last item, it leaves the list, and a nested list continues in its parent. After an unclosed `\begin{…}`, it adds the `\end{…}`. |
| Shift+Enter | A plain new line, with no item marker |
| Ctrl+P | Open a file by name (fuzzy; sources are listed before images) |
| Ctrl+W | Close the tab, offering to save it first |
| Ctrl+Tab / Ctrl+Shift+Tab | The most recently used tabs, while Ctrl is held |
| Ctrl+PageDown / Ctrl+PageUp | The next / previous tab |
| Alt+Left / Alt+Right | Back / forward through the places you jumped between (also the mouse's back and forward buttons, and ‹ › in the title bar) |
| Alt+PageDown / Alt+PageUp | In a multi-part paper: the next / previous file in reading order |
| Ctrl+Alt+S | Save every unsaved file, then compile once |
| Ctrl+Shift+H | Search the vault, starting from the selected text |
| Ctrl+Shift+C | Cite: open the cite picker (so does typing `\cite{`) |
| F2 | On a `\label` or `\ref` key, rename the label and every reference to it across the vault |
| Ctrl+Alt+T | Edit the table the cursor is in, or insert a new one |
| Ctrl+Shift+\\ | Jump between a `\begin{…}` and its `\end{…}`, or a `\left` and its `\right`, or matching brackets |
| Ctrl+. | Spelling suggestions for the underlined word at the cursor (right-click works too) |

### Brackets and quotes

- `\left(` adds `\right)`. The same goes for `\left[`, `\left|`, `\left.`, `\left\{`, `\left\langle`, `\left\lvert`, `\left\lVert`, `\left\lfloor` and `\left\lceil`. Typing `)` or `]` just before the added `\right)` steps over it.
- `\{` adds `\}`. In text, `\(` adds `\)` and `\[` adds `\]`. In math, `\langle`, `\lvert`, `\lVert`, `\lfloor` and `\lceil` add their closers.
- In text, ``` `` ``` adds `''`, and typing `''` just before it steps over it.
- **Smart quotes:** `"` in text becomes ``` `` ``` or `''` depending on where it is. Math, comments, the preamble, verbatim, `\"o` accents and arguments like `\url{…}` and `\label{…}` are left alone.
- Backspace inside an empty pair (`\left(|\right)`, `\{|\}`, ``` ``|'' ```) removes both halves.
- With the cursor on `\begin{x}` or `\end{x}`, both are highlighted. The same goes for `\left(` and its `\right)`.

### Math shortcuts

Inside math, some character sequences expand as you type them. Backspace straight after an expansion puts back what you typed. Nothing expands in text, or inside `\text{…}`, `\label{…}` or siunitx arguments within math. A shortcut made of letters fires only at the start of a word, so typing `\sqrt` or `\cdot` is never interrupted.

| Type | Get |
|---|---|
| `@a` `@b` `@g` `@d` `@e` `@q` `@l` `@m` `@p` `@r` `@s` `@t` `@f` `@y` `@w` … | `\alpha` `\beta` `\gamma` `\delta` `\epsilon` `\theta` `\lambda` `\mu` `\pi` `\rho` `\sigma` `\tau` `\phi` `\psi` `\omega`. A capital gives the capital letter (`@D` → `\Delta`, `@W` → `\Omega`). `@ve`, `@vq` and `@vf` give `\varepsilon`, `\vartheta` and `\varphi`. The letters follow vim-latex. |
| `x1`, then `x_12` | `x_1`, then `x_{12}` |
| `//` | `\frac{}{}` (Tab moves to the denominator) |
| `sq` `sr` `cb` `td` `invs` `deg` | `\sqrt{}` `^{2}` `^{3}` `^{}` `^{-1}` `^\circ` |
| `xhat` `xbar` `xvec` `xdot` `xddot` `xtilde` | `\hat{x}` and so on. On its own, `hat` gives `\hat{}`. |
| `->` `=>` `<=` `>=` `!=` `~~` `==` | `\to` `\implies` `\leq` `\geq` `\neq` `\approx` `&=` |
| `**` `xx` `+-` `-+` `...` `ooo` | `\cdot` `\times` `\pm` `\mp` `\dots` `\infty` |
| `prop` `par` `del` | `\propto` `\partial` `\nabla` |
| `sum` `int` `lim` `ddt` `ddx` `txt` | `\sum_{}^{}`, `\int_{}^{} \,d`, `\lim_{ \to }`, `\frac{d}{dt}`, `\frac{d}{dx}`, `\text{}` |

A letter typed right after a shortcut that ends in a command gets a space first, so `->` then `b` gives `\to b`, not `\tob`.

**Edit → Math Shortcuts…** opens the vault's `math-snippets.txt`. If the file doesn't exist it is created, with every built-in listed for reference. Shortcuts and snippets can also go in `math-snippets.txt` and `snippets.txt` in the app's data folder; these apply to every vault, and a vault's own file wins. Put one shortcut per line, as `trigger => replacement`:

- `$1`, `$2` and so on are Tab stops, and `$0` is where the cursor ends up.
- A `/regex/` trigger can use its groups in the replacement as `[[0]]`, `[[1]]` and so on.
- `!trigger` turns a built-in off, and a line with a built-in's trigger replaces it.
- Saving the file applies it.

### Spelling

Prose is spellchecked against a US English dictionary, and misspelled words get a red wavy underline. Only `.tex` files are checked. The checker skips:

- math, comments, the preamble (apart from `\title`, `\author` and `\date`), verbatim and TikZ;
- command names and optional `[…]` arguments;
- the arguments of commands that aren't prose, such as `\label`, `\ref`, `\cite`, `\includegraphics`, `\url`, `\begin`, lengths and siunitx units;
- single letters, acronyms of up to five capitals, and words next to digits.

Right-click an underlined word, or press Ctrl+. in it, for suggestions, **Add to words.txt** or **Ignore** (for this session). The vault's `words.txt` holds its own words, one per line, and `#` starts a comment. You can edit it directly; saving reloads it. **View → Check Spelling** turns spelling on and off.

### Tabs

Each opened file gets a tab, placed after the current one. A dot marks unsaved changes. Close a tab with × or a middle click, and drag tabs to reorder them. Each tab keeps its own cursor, scroll position and undo history. Quitting, or opening another vault, with unsaved files asks whether to save them.

### Symbols

**Symbols** in the sidebar holds a library of 1,123 LaTeX symbols, and you can also draw one to find it.

- **Draw** a symbol on the pad. The list then shows the best matches, and **Clear** returns to the library. Matches the open document can already use come first. Those that would need another package come after, fainter.
- **Trace on a trackpad:** click the pad without dragging, then draw on the trackpad as if it were the box on the pad. The mapping stays fixed, so where you touch is where the ink goes. Each touch and lift starts and ends a stroke exactly, and a second stroke lands where your finger comes down. Taps are ignored. The trace finishes by itself 1.5 s after your last stroke, or when you press the trackpad, Enter or Esc.
  - This reads the trackpad directly, which needs Windows and a Precision Touchpad. A small helper (`src/main/touchpad-helper.cs`) is compiled once with Windows' built-in C# compiler and runs only while you trace.
  - Elsewhere, tracing follows the cursor instead, and a short pause ends each stroke.
- **Search** by command name ("approx", "arrow") or package, or pick a package from the list. The symbols you've used recently come first.
- **Click** a symbol to copy its command. **Double-click** to insert it at the cursor: a math symbol typed in text goes in `$…$`, and a text symbol typed in math goes in `\text{…}`. If the document doesn't load the symbol's package yet, its `\usepackage` is added to the preamble too.
- **Right-click** a symbol for more:
  - copy the command, or copy it as `$…$`;
  - insert it;
  - add its `\usepackage` (or `\usepackage[T1]{fontenc}`) to the document's preamble, which the menu skips if the document or its class already loads it;
  - copy the `\usepackage` line.

Recognition runs offline in a background worker, in about 10 ms a drawing. The symbol list, the symbol images, the handwriting samples and the recognition method come from [Detexify](https://detexify.kirelabs.org) by Daniel Kirsch, through [Detexify Next](https://github.com/kirel/detexify-next). Hover over **ⓘ Detexify** on the pad for the credit and links. The code is MIT-licensed, and the training data is under the Open Database License; see `src/plugins/symbols/ui/assets/NOTICE.md`. `node scripts/import-detexify.mjs [commit]` refreshes the data.

### Search

**Search** in the sidebar (Ctrl+Shift+H) looks through every text file in the vault, using your unsaved changes where there are some. Its toggles are match case (`Aa`), whole word (`ab`), regular expression (`.*`) and include `%` comments. Comments are skipped by default. Results are grouped by file; click one to open the file with the match selected.

Open the replace field with ▸. You can replace one match, one file (↺), or **All** (Ctrl+Alt+Enter). A regex replacement can use `$1` and so on. Changed files open as unsaved tabs, so each file's change can be undone with Ctrl+Z. Ctrl+Alt+S saves them all.

### Citations

The **cite picker** searches the document's bibliography. Open it with Ctrl+Shift+C, the **Cite** button, or by typing `\cite{` (or `\citep{`, `\parencite{`, …).

- Each reference shows its authors and year, the title, the journal, its keywords as tags (Zotero exports tags there) and its key. The number is shown too, if the document already cites it.
- Every word you type must match the key, an author, the title, the year, the journal or a tag. `#word` matches tags only; click a tag to add it.
- With nothing typed, the references the document already cites come first, in order, then the rest by author.
- ↑/↓ move, and Enter inserts `\cite{key}`. Tab, a tick box or Ctrl+click marks several, and Enter inserts them all as one `\cite{a,b}`. With the cursor inside a `\cite{…}`, the keys are added to it.

Inside `\cite{…}`, completion offers keys the same way: `\cite{kocks` finds `kocksPhysicsPhenomenologyStrain2003`. Each key shows its authors, year and number, with the title and journal beside it. In source view, hovering a cite key shows its reference.

### Multi-part papers

A paper split into files (`main.tex` with `\input{1_Intro}`, `\input{2_methods}`, …) can be marked as a **multi-part paper**. Open any of its files: the **Contents** view (its own icon in the activity bar, or click the section in the status bar) offers **Mark as paper** when a document brings in other files. Marking records the paper in `.vault.json` (`"papers": ["main.tex"]`) and adds `% !TEX root = main.tex` to the top of each of its files, so other editors build the right document too.

In a marked paper, each file reads as part of the whole:

- Saving any of its files builds the paper, even straight after the app starts.
- Numbers carry on from the file before: the section file of section III starts at III, its equations carry on from the last one before it, and an appendix's equations start again at A1 (as revtex does). Section and equation numbers follow the class: revtex's I, II, A, B; the standard classes' 1, 1.1.
- `\ref` and `\eqref` to a label in another file show its number. Ctrl+click opens that file at the label. Completion inside `\ref{…}` offers the paper's labels, e.g. `eq:closure  Eq. (41) · 3_reduced`.
- In `main.tex`, each `\input` shows as a card with the file's numbered sections. Click it to open the file; Alt+click edits the line. A commented-out `\input` shows dimmed, as switched off.
- The title bar shows where you are, e.g. `3_reduced.tex · main §III` or `main §VI–VII`, and the status bar the section under the cursor with its number.
- The paper's tabs have a § before the file name.

**The paper map.** In a marked paper, Contents lists every file in reading order, each with its § numbers and numbered sections. Click a file or a section to open it there. The open file shows all its headings; the others show their top-level sections.

- **Reorder:** drag a file among its siblings. Its `\input` line moves, with any comment lines just above it.
- **Switch off:** the eye comments out the file's `\input`, leaving it out of the build; click again to switch it back on.
- **New section file:** **+** (at the end) or a file's ⋯ menu (after it). Give the section's title; the file is named from it, put where the paper's other files are, and opened.
- **Move a section to its own file:** right-click a section in the map. Its text, up to the next heading at its level, goes to a new file, with an `\input` in its place.
- **Put back:** a file's ⋯ menu puts its text back in place of its `\input`, then offers to send the file to the Recycle Bin.
- **Renumbering:** when the paper's files are named `1_Intro`, `2_Model`, … and a reorder or a new file puts them out of order, the map offers to renumber them, listing each rename first. A reorder reuses the same numbers (so `67_discussion` keeps 67); a new file takes the next number and the files after it move up only as far as they must. **Undo** puts the old names back.
- The ⋯ by the paper's name can stop treating it as a multi-part paper.

**Section builds.** While you work in a file of a marked paper, the preview builds just its section: the root's preamble, then only the `\input` you're in, starting from the numbers the paper gives it (section III's file starts at III, its equations carry on from the one before), with the labels and citations from the last full build. The PDF shows only that section, and the title bar says so (`§III · 1.4 s`). The switch over the PDF (**§III | Paper**) goes back to building the whole paper.

- Saving builds just the section too, unless that could be wrong: the whole paper builds when it hasn't been built in full yet, when another of its files was saved since the last full build, or when the file defines a new label or cites a new key. Hovering over the build note says which, and why.
- Build → Recompile always builds the whole paper and updates `pdf/`. Section builds never touch `pdf/`.
- A file nested deeper (an `\input` inside a section file) builds the top-level file it's in.

**Moving around a paper.** At the top and foot of each of its files are the files before and after it, a click away (Alt+PageUp, Alt+PageDown). Every jump (Ctrl+click on a ref, a citation or an `\input` card, Contents, Problems, search, the PDF, opening a file) can be undone with Alt+Left, and redone with Alt+Right. Going back switches to the file's tab, or reopens it: a file is only ever open once.

**Search and rename within the paper.** In a paper's file, the search box's **§** limits the search (and replace) to the paper's files, listed in reading order. F2 on a label renames it and its references in the paper's files only.

`\include`, `\subfile`, `\import` and `\subimport` are read too; `\input` is what the app recommends, since it doesn't force page breaks and every journal and arXiv accept it.

### Tables

The table editor is a dialog with a grid of cells, each cell holding its LaTeX. Open it in any of these ways:

- **Edit table** on a table in the live view;
- Ctrl+Alt+T with the cursor in a table, or anywhere else for a new one;
- **pasting** cells from Excel, Google Sheets or a web page. Inside a table, the rows go in after the cursor's row; anywhere else, they make a new table. Ctrl+Shift+V pastes the plain text instead.

In the grid:

- Tab, Enter and the arrow keys move between cells. Tab from the last cell adds a row. Alt+↑/↓ moves a row. Shift-click selects cells to merge.
- The toolbar adds, moves and deletes rows and columns. It also sets vertical lines and the rule above each row, merges and splits cells (`\multicolumn`), and makes the header row bold.
- Each column's alignment is left, centre, right, wrap (`p{width}`), or decimal (siunitx `S`). Columns of numbers get a suggestion to align on the decimal point.
- Style presets are booktabs (the default for new tables), grid and plain.
- The table can sit in a `table` float with a caption, a label (suggested from the caption), a placement, and centring.
- Pasted text is escaped (`%` becomes `\%` and so on) unless **Paste LaTeX as is** is ticked.

**Apply** (Ctrl+Enter) writes the table back with its `&` columns lined up, as one undoable change. If the table needs booktabs, siunitx or array and the document doesn't load it, a `\usepackage` line is added to the preamble. Tables with `%` comments inside, or more than one tabular in a float, stay in the source view.

- Renaming either end of `\begin{x}` or `\end{x}` renames the other.
- Typing `$` adds the closing `$`.
- Completion covers:
  - commands, including the class's and preamble's own, with argument placeholders (Tab moves between them);
  - environment names after `\begin{`;
  - labels inside `\ref{…}`;
  - bibliography keys inside `\cite{…}` (see Citations);
  - the vault's snippets.
- Environments, sections and questions fold from the gutter.
- The **Outline** under the file tree lists the open file's sections and questions. Click one to jump there.

Per vault, in `.vault.json`:

```json
{
  "lists": { "questions": "question", "parts": "part", "choices": "choice" },
  "snippets": "snippets.txt",
  "mathSnippets": "math-snippets.txt",
  "words": "words.txt"
}
```

- `mathSnippets` and `words` name the math shortcut file and the spelling word list. The defaults are shown above.

- `lists` maps each list environment to its item command, and is added to `itemize`, `enumerate` and `description`.
- `snippets` names the snippet file. It defaults to `snippets.txt` at the vault root. Each snippet starts with a line `%%% name — description`, and its body runs to the next `%%%` line. The body can use `${1:placeholder}` fields. Type `\name` to insert a snippet. Saving the file reloads it.
- `fixtures/vaults/1200-latex` has examples of both.

## Layout

- `src/main/`: the Electron main process (Node).
  - `vault.ts`: file tree and file watching.
  - `compile.ts`: runs pdflatex, both saved builds and previews, and extracts errors.
  - `preamble.ts`: the preamble format cache.
  - `bibliography.ts`: running BibTeX or biber during a build, and reading a document's `.bib` files for the editor.
  - `shadow.ts`: the shadow folder that previews build from, and the mapping back to vault paths.
  - `search.ts`: vault-wide search.
  - `spell.ts`: the spellchecker (nspell with dictionary-en) and the vault's word list.
  - `index.ts`: the window and the IPC handlers.
- `src/preload/`: the bridge that exposes `window.api` to the UI.
- `src/renderer/`: the UI in Svelte, with a CodeMirror editor and a PDF.js viewer.
  - `lib/editing.ts` wires the LaTeX editing helpers into the editor. `lib/pairs.ts`, `lib/mathShortcuts.ts` and `lib/spellcheck.ts` add brackets and quotes, math shortcuts and spelling.
  - `CitePicker` is the cite picker, and `lib/citations.ts` holds the bibliography the editor uses. `TabBar`, `QuickOpen`, `SearchPanel` and `TableEditor` are the components for tabs, quick open, search and the table editor.
- `src/shared/latexedit.ts`: the text logic behind those helpers (lists, environments, formatting, outline, snippets), unit tested.
- `src/shared/bibtex.ts`: parses `.bib` files, BibTeX and biber logs, and `\bibcite` labels, and searches entries, as pure text logic.
- `src/shared/search.ts`: search, replace and label rename, as pure text logic.
- `src/shared/tablemodel.ts`: parses and writes tables, the grid operations, and reading clipboard data.
- `src/shared/pairs.ts`, `mathsnippets.ts` and `spellwords.ts`: the text logic for brackets and quotes, math shortcuts (including the built-in list), and finding the prose words to spellcheck.
- `src/shared/detexify.ts`: handwritten symbol recognition, ported from Detexify. `src/plugins/symbols/` is the Symbols plugin: `ui/SymbolPanel.svelte` and `ui/detexify.worker.ts` are the panel and its worker, and `src/plugins/symbols/ui/assets/` holds the imported library and samples.
- `docs/IDEAS.md`: the backlog of feature ideas.
- `src/shared/api.ts`: the types every layer shares.
- `fixtures/`: sample vaults (`AngStatsRevTex` is a revtex paper with a Zotero `.bib`), the shared template library and real log files for testing.
