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

## Teaching

Making the app usable by students learning LaTeX, who need to produce *Physics in Progress* manuscripts (`fixtures/vaults/Physics_in_Progress_Issue_2`). The diagnosed errors and quick fixes already cover what breaks the build. These ideas cover the rest: starting a manuscript correctly, and the house-style mistakes that compile fine. Every example below comes from a Volume 2 manuscript.

- **New PiP manuscript.** A form that asks for the title, author, article type (`rc`/`oa`), Editor's Suggestion, and the received and published dates. It creates `Manuscripts/<Lastname_Topic>/manuscript.tex` from `template.tex`, plus an empty `bib.bib`, and opens it. This is a narrower first step towards "New paper from a journal template". It would stop the leftovers in the vault: `apssamp.bib`, `sorsamp.bib` and `sorsamp.tex` in `Semaje_ElecDiff`, the APS sample's comments in `Semaje_PhotoElect`, and `%PIP-…OA046` tracking comments that contradict an `rc` option.
- **A locked preamble.** In a teaching mode the folded preamble is read-only, and a few named controls stand in for it: Editor's Suggestion, article type, add siunitx.
- **A section skeleton.** The required sections in order: Introduction, …, Conclusion, Acknowledgments, Data Availability Statement, `\bibliography`. Each holds a line of guidance that is flagged until it's replaced. Template placeholders (the `Logo.pdf` figure, "Replace with a real figure") are flagged the same way.
- **A house-style checker.** Warnings with a one-click fix and a one-line "why", switched on per vault and worded to teach rather than nag. It builds on "Warnings while you edit" above. The rules, each from a real manuscript:
  - `\ref` with no "Fig." (`As can be seen in \ref{fig:FBDs}`), and `fig \ref`, `eq. \ref`, `eq.\ref`: use `\cref`, which the template uses, or `Eq.~\eqref`.
  - Units typed by hand (`$\text{C}$`, `$2.78\text{eV}$`, `$546 $ nm`, `7.560 mm`): use `\qty{…}{…}`, and add `\usepackage{siunitx}` if it's missing.
  - A number with no leading zero (`.0913`): add the zero. An uncertainty becomes `\qty{1.569 \pm 0.091}{…}`.
  - A word written as an italic subscript (`V_{stop}`): use `V_{\text{stop}}`.
  - An accent over a subscript (`\bar{v_f}`): use `\bar{v}_f`.
  - Labels with no prefix (`noPolEq`, `Frequency`) or with a space (`E electron`): suggest `eq:`, `fig:` and `tab:`.
  - `\ \\` and a bare `\\` used for spacing: remove them, and explain how paragraphs work.
  - Unicode pasted from Word (`Pa·m`, `°C`, curly `’`): use `\unit{\pascal\metre}`, `\qty{25.5}{\celsius}` and a plain `'`.
  - `width=1\linewidth` on a detailed plot: explain that this is one column of a two-column page, and offer `figure*`.
  - No comma or full stop after a display equation: a gentle hint only, since this is less certain.
- **A units helper for students.** Typing `9.81 m/s^2` or `6.5(2)e-34 J s` in prose offers the `\qty` form. This is the same helper as under "Faster math typing", made a priority. `\SI` or `\qty` with no siunitx loaded gets a direct fix: the class leaves siunitx out on purpose, and the undefined-command error doesn't make that clear.
- **Drag in a figure.** Dropping an image on the editor copies it into the manuscript's folder and inserts the figure that Ctrl+Shift+F makes. It warns about spaces in filenames (`Graph of Indicies.png`, `Sv vs Dist.png`, `Lab 4 Schematic.pdf`).
- **A citation from a DOI.** Paste a DOI and get a `.bib` entry, for students who don't have Zotero set up.
- **A pre-submission check.** Before the PDF goes to the editor, check for:
  - undefined refs and cites;
  - placeholders still in the text;
  - a `\cite` in the abstract;
  - a page count over the limit for the article type;
  - overfull boxes;
  - labels that clash with another manuscript's, which would break `issue.tex`.
- **Revision rounds.** Students now mark changes by hand: `Braedon_EoverM/marked.tex` wraps each change in `\textcolor{red}{…}`, adds "% TITLE COMPLETELY CHANGED" comments, and has gone back to bare `revtex4-2`.
  - **Snapshot as submitted / Show changes since submission.** This produces the red-marked PDF automatically, latexdiff-style, from the snapshot. It goes with "Git history for each file".
  - **Instructor comments anchored to source lines.** They show in the live view and in Problems, so feedback sits where the fix goes.
- **Click to learn.** Alt+click a rendered construct (a `\qty`, an `align`, a `\cref` chip) for a short paragraph on the LaTeX behind it.

Suggested order: the new-manuscript form and skeleton; the checker, starting with the refs, units and labels rules; the units helper; the pre-submission check; revision snapshots.

## Plugins

- **A plugin engine (done).** Optional features switched on per vault, from the Plugins view; see `docs/design/PLUGINS.md`. Symbols is the first plugin.
  - Problem bank (done) and Zotero (done) are plugins too. Next could be Mendeley as a second reference provider.

## Decided against

- A student copy / answer key toggle. This isn't a normal LaTeX use case.
