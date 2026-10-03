# Ideas

What would make this a better LaTeX editor, roughly in order of payoff. Items marked **(done)** are built.

## Biggest wins

- **Vault-wide search and replace (done).** Search every file, not just the open one, with regex, case, whole-word and skip-comments options. Includes renaming a `\label` everywhere, so every `\ref`, `\eqref` and `\cref` to it changes too.
- **Faster compiles (done).**
  - Precompile the preamble into a format once, so a save only rebuilds the body.
  - Compile a preview of the unsaved buffers when typing pauses, not only on Ctrl+S.
  - Keep the old PDF on screen until the new one is ready.
- **Tabs (done).** Open files as tabs, with Ctrl+P quick open, Save all, and drag to reorder. Later, Ctrl+P could also jump to a section or question anywhere in the vault.
- **Table editor (done).** A dialog with a grid: edit cells, add and move rows and columns, set alignment and rules. Pasting from Excel or Sheets opens it. Booktabs by default, and `S` columns for numbers.

## Everyday annoyances

- **Spellcheck that skips LaTeX (done).** It ignores commands, math and labels, and keeps its own word list per vault (`words.txt`).
- **Brackets that understand LaTeX (done).** `\left( … \right)`, `\{ \}`, ``` `` '' ``` and smart quotes, with matching `\begin`/`\end` highlighted and a jump key.
  - Still to do: live warnings as you type, for a `\left` with no `\right`, mismatched environments and unbalanced braces.
- **Faster math typing (done).** Shortcuts that fire as you type in math: `//` → `\frac{}{}`, `@a` → `\alpha`, `xhat` → `\hat{x}`, `x1` → `x_1`. Each vault can edit the list.
  - Still to do: a units helper that suggests `\SI`/`\qty` for things like `9.8 m/s^2`, and text-mode triggers (`mk` → `$…$`).
- **A symbol palette you can search (done).** The Symbols panel: draw a symbol (Detexify, offline) or search the library, click to copy, double-click to insert, right-click to add its package.
- **Warnings while you edit, with one-click fixes.** For example `$$ … $$` instead of `\[ … \]`, a missing `~` before `\ref`, `"quotes"`, and `...` instead of `\ldots`.
- **Drawing help.** Live-preview a single `tikzpicture` without compiling the whole document. Start from free-body diagram and circuit templates.
- **Copying from the PDF.** Select text in the PDF and jump to the source that made it.
- **A print dialog.** Print the current PDF from the app, with the usual printer, page range and copies options.
- **Drag a PDF's filename to copy it.** Drag the compiled PDF (from the header or the viewer) into Explorer, an email or an LMS upload box, and the file goes with it.

## Across a semester

- **Git history for each file.** Show what changed since last year's version and restore old versions. Snapshots on each save would give undo that lasts after you close the file.
- **Reusing problems.** A question bank: tag `\question` blocks by topic and pull them into a new homework or exam. Being built as the Problem bank plugin (`docs/design/PLUGINS.md`).
- **Building many documents at once.** Rebuild every document that uses a class after it changes, and report which ones broke.
- **A bibliography (done).** BibTeX and biber run as part of a build, only when citations or a `.bib` changed. There's a cite picker (search by author, title, year, journal or tag), `\cite` completion, numbered cite chips in the live view, and a "did you mean" fix for a mistyped key.
  - Still to do: other engines (XeLaTeX, LuaLaTeX).

## Papers

- **Multi-part papers.** Done: marking a paper, each file building it, numbering and refs carried across files, `\input` cards, the paper map (reorder, switch off, new section file, move a section out and back, renumbering), section builds, back/forward, next/previous file, search and rename within the paper. Could follow:
  - a "Move section to its own file" command in the editor (it's in the paper map's right-click today);
  - SyncTeX from a section build's PDF back into the root's lines (its own lines are blanked copies of the root's).
- **New paper from a journal template.** Recently used classes, the template folder, and a curated journal list (revtex, elsarticle, IEEEtran, …). Each is marked installed or available, and MiKTeX installs a missing class, with progress shown.
- **Submission bundle.** Flatten the `\input`s into one file, include the `.bbl`, keep only the figures used, and zip it for arXiv or a journal.
- **Page checks before printing.** Flag an overfull box as a visible marker in the PDF. Warn when a question splits across a page break, and give a page count.

## Plugins

- **A plugin engine (done).** Optional features switched on per vault, from the Plugins view; see `docs/design/PLUGINS.md`. Symbols is the first plugin.
  - Problem bank (done) and Zotero (done) are plugins too. Next could be Mendeley as a second reference provider.

## Decided against

- A student copy / answer key toggle. This isn't a normal LaTeX use case.
