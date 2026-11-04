# Onboarding and help

Help and first-run work from [the UI/UX review](../../docs/design/UX-REVIEW.md), which scored learnability 2.5 / 5. The student is a junior physics major learning LaTeX to write revtex lab reports like those in `fixtures/vaults/Physics_in_Progress_Issue_2`, and already knows VS Code. The editor fixes are in [ux-fixes](../ux-fixes/spec.md).

## Goals

- A new student's first vault starts as a buildable lab report, not an empty folder.
- A student can learn LaTeX and endleaf from inside the app, offline.
- Every shortcut can be found from the Help menu.
- A machine with no TeX installed says so plainly, instead of failing builds.

## Non-goals

- A coach-mark tour.
- An online docs site.
- Renaming "vault". It stays, explained once ([GLOSSARY.md](../../GLOSSARY.md)).

## Design

### Lab report starter and default starters

- **A new built-in starter, "Lab report (revtex)",** in `src/main/starters.ts`. It uses plain `revtex4-2` (`reprint`, `aps`) and loads `siunitx`, `graphicx` and `amsmath`. It contains:
  - `\title`, `\author`, `\affiliation` and an abstract;
  - Introduction, Theory, Methods, Results and Conclusion sections;
  - one numbered equation with a `\label`, and one figure with `\includegraphics`, `\caption` and `\label`;
  - a quantity written with `\qty`, and `Eq.~\eqref` / `Fig.~\ref` in the text;
  - acknowledgments and `\bibliography{references}`.

  Choosing it also creates `references.bib`, if missing, with one example entry.
- **A default starter for each vault.** `.vault.json` gains `defaultStarter`, which names a starter. The New file dialog preselects it. Right-clicking a starter in the dialog offers "Use as this vault's default".
- **An app-wide default starter** in app settings covers vaults without one. It ships as Lab report (revtex).

### New vault flow

After the folder picker, a short dialog asks for the vault's name (defaulting to the folder's name) and its starter (preselected to the app-wide default). Then endleaf:

1. writes `.vault.json` with the chosen `defaultStarter` and a random palette, as today;
2. creates `main.tex` (plus `references.bib` for the lab report) from the starter;
3. opens `main.tex` in Live view with the PDF beside it, and builds once.

If the folder already holds `.tex` files, skip the dialog and open it as an existing vault.

### Help menu

Generated from the command registry (ux-fixes ticket 01):

- **Keyboard Shortcuts** (Ctrl+K Ctrl+S): a searchable panel listing every command with a key, grouped by category, generated from the registry.
- **Getting Started**: opens the Getting-started vault.
- **Math Shortcuts…**: moved from Edit.
- **Show Hints Again**: resets the first-time hints.
- **Report an Issue…**: opens `https://github.com/joe-p-anderson/latex-editor/issues/new` with the app version and OS in the body.
- **About endleaf**: the version, and the TeX distribution found (or "none found").

### Getting-started vault

- **How it's opened:** a third button on the welcome screen, "Try the Getting-started vault", or Help → Getting Started. The first time, endleaf copies the bundled sample into `Documents/endleaf/Getting started` and opens it. Later it reopens that copy, offering "Start over" (replace the copy) if the copy has changed.
- **Look:** `.vault.json` fixes the appearance (Bookbinder's Blue, Black page), so every student sees the same thing.
- **Content:** a short plain-revtex lab report (simple pendulum: measuring *g*) whose prose teaches. Reading it in Live view explains, in order:
  - what a vault is and what Live view and Source view are, in the first paragraph;
  - that saving builds, and where the PDF is;
  - the front matter and abstract;
  - sections, and how `\input` splits a long document (Methods is in `methods.tex`);
  - inline and display maths, a numbered `equation` with `\label` and `Eq.~\eqref`, and the Σ panel for symbols;
  - quantities with `\qty{9.81}{m/s^2}`, noting that the `\SI` students will see in older papers is the same thing in siunitx's old syntax;
  - a figure with `\includegraphics`, `\caption`, `\label` and `Fig.~\ref`;
  - citations with `\cite` from `references.bib`;
  - where to find more, namely Help → Keyboard Shortcuts and the command palette.

  Short `%` comments in the source name the shortcut for each construct (`% Ctrl+M wraps a selection in $…$`).
- **Two deliberate slips** for the student to fix:
  1. An undefined command, so the first build shows the Problems panel. The prose around it says: build, read the error, click it, fix it.
  2. Units typed as maths (`$g = 9.8 m/s^2$`) next to the `\qty` form, so Live view shows the difference. The prose asks the student to fix the first one.
- **Files:** `main.tex`, `methods.tex`, `references.bib`, one figure (a PDF or PNG plot of *T* against √*L*) and `.vault.json`. It mustn't depend on `physicsinprogress.cls`.

### First-time hints

A small mechanism for up to three hints. Each is a dismissible strip under the title bar, shown at most once, one at a time. Dismissals are stored in app settings, and Help → Show Hints Again clears them.

1. **Live/Source**, the first time a `.tex` file opens: "You're in Live view: maths and formatting render as you type, and the line you're on shows its LaTeX. Switch to Source view for plain LaTeX (Ctrl+Shift+L)."
2. **First build**, after the first successful build: "Saving built your PDF. Ctrl+S builds, and Ctrl+Shift+B rebuilds without saving."
3. **First error**, the first time the Problems panel opens with an error: "Click an error to jump to its line. TeX's raw output is folded under each one."

Don't add a fourth hint without revisiting this spec.

### Welcome screen and empty states

- **Welcome screen:** one line under the actions: "A vault is a folder of related .tex files: a course, a lab report, a paper." It also gets the Getting-started button.
- **Tooltips** for app-specific terms where they appear: paper/page, endpaper, the § in build status, and Layout.
- **Empty editor** (vault open, no file): a short shortcut list drawn from the registry (Ctrl+Shift+P, Ctrl+P, Ctrl+N, Ctrl+S builds, Ctrl+Shift+F), plus links to Keyboard Shortcuts and Getting Started.

### No TeX installed

At launch, endleaf checks for `pdflatex` (and `latexmk`, if the build uses it) on PATH and in MiKTeX's and TeX Live's usual install locations.

If neither is found:

- the welcome screen and the empty PDF pane show a card saying "endleaf needs a TeX distribution to build PDFs", with links to MiKTeX (Windows) and TeX Live, and a Check again button;
- Build commands are disabled, and saving still saves;
- the first-build hint doesn't show.

About endleaf shows what was found.

## Tickets

1. [Lab report starter and default starters](issues/01-default-starter.md)
2. [New vault flow](issues/02-new-vault-flow.md)
3. [Help menu and Keyboard Shortcuts panel](issues/03-help-menu.md)
4. [Getting-started vault](issues/04-getting-started-vault.md)
5. [No-TeX detection and card](issues/05-no-tex-card.md)
6. [First-time hints](issues/06-first-time-hints.md)
7. [Welcome screen, tooltips and empty editor](issues/07-welcome-and-empty-states.md)
