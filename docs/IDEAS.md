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
- **A symbol palette you can search.** Draw a symbol (like Detexify) or type "approx" to get `\approx`.
- **Warnings while you edit, with one-click fixes.** For example `$$ … $$` instead of `\[ … \]`, a missing `~` before `\ref`, `"quotes"`, and `...` instead of `\ldots`.
- **Drawing help.** Live-preview a single `tikzpicture` without compiling the whole document. Start from free-body diagram and circuit templates.
- **Copying from the PDF.** Select text in the PDF and jump to the source that made it.
- **A print dialog.** Print the current PDF from the app, with the usual printer, page range and copies options.
- **Drag a PDF's filename to copy it.** Drag the compiled PDF (from the header or the viewer) into Explorer, an email or an LMS upload box, and the file goes with it.

## Across a semester

- **Git history for each file.** Show what changed since last year's version and restore old versions. Snapshots on each save would give undo that lasts after you close the file.
- **Reusing problems.** A question bank: tag `\question` blocks by topic and pull them into a new homework or exam.
- **Building many documents at once.** Rebuild every document that uses a class after it changes, and report which ones broke.
- **Other engines and a bibliography.** Support for `latexmk`, XeLaTeX and LuaLaTeX, BibTeX/biber, and `\cite` completion.
- **Page checks before printing.** Flag an overfull box as a visible marker in the PDF. Warn when a question splits across a page break, and give a page count.

## Decided against

- A student copy / answer key toggle. This isn't a normal LaTeX use case.
