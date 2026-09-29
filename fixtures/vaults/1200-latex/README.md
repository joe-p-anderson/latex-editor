# PHY 1200 handouts — local builds

This folder is an Overleaf project. It also builds locally, and stays
round-trippable: nothing here depends on a local-only path, so you can still
upload it to Overleaf unchanged.

None of the tooling here names a course. `build.ps1`, `Makefile`, `.latexmkrc`
and `.vscode/settings.json` all locate themselves relative to this folder, so
setting up another course is a copy:

```bash
cp -r 1200/latex/{build.ps1,Makefile,.latexmkrc,.vscode} 2200/latex/
```

See [Adding another course](#adding-another-course) for the one thing that is
not automatic.

## Build

Windows (PowerShell). The script switches to its own directory first, so you can
invoke it by any path — e.g. from the repo root:

```bash
./1200/latex/build.ps1
```

macOS / Linux / WSL, **from this directory**:

```bash
make
```

PDFs land in `build/`, which is git-ignored. Useful variations:

```bash
./build.ps1 -Path Labs                      # one folder
```

```bash
./build.ps1 -Path Labs/Lab7_RayOptics.tex   # one document
```

```bash
./build.ps1 -Clean                          # delete build/
```

`build.ps1` uses `latexmk` when it finds a working one and otherwise falls back
to three `pdflatex` passes (needed for the `lastpage` page numbers).

## Compiling a single file by hand

Overleaf resolves `\includegraphics` and the class files relative to the project
root, so **run the compiler from this directory**, not from inside `Labs/`,
`Homework/`, etc.:

```bash
pdflatex -interaction=nonstopmode -output-directory=build Labs/Lab7_RayOptics.tex
```

The documents in `Labs/`, `Homework/` and `Reflection/` also compile from their
own folder — they set `\graphicspath{{./}{../}}` so `Images/…` resolves either
way. `FinalDemos/` and `FieldWork/` cannot, because `\documentclass{handout}`
and `\documentclass{reflection}` only find their `.cls` when the compiler runs
from here.

## VS Code + LaTeX Workshop

**Open this folder as the workspace root** — `File > Open Folder... > 1200/latex`,
not the repo root. [.vscode/settings.json](.vscode/settings.json) then applies
automatically, and because it refers only to `%WORKSPACE_FOLDER%` it is the same
file for every course.

It changes two defaults:

- The build tool gets `"cwd": "%WORKSPACE_FOLDER%"`, so LaTeX Workshop compiles
  from this folder instead of from the document's own folder. This is what makes
  `FinalDemos/` and every `Images/…` reference work.
- The recipes call `pdflatex` directly instead of `latexmk`. LaTeX Workshop's
  stock recipe is `latexmk`, which is a Perl script — see the note at the
  bottom.

If you open the repo root instead, these settings do not apply and builds will
fail on `FinalDemos/`. Opening the course's `latex/` folder is the supported
setup.

Day to day:

- Open any `.tex` file and press `Ctrl+Alt+B` to build, `Ctrl+Alt+V` to open the
  PDF in a tab. `Ctrl+Alt+J` jumps from the source to that spot in the PDF, and
  <kbd>Ctrl</kbd>+click in the PDF jumps back. `Ctrl+Alt+C` cleans `build/`.
- `Ctrl+L Alt+X` opens the LaTeX sidebar — recipe picker, document outline, and
  the build log when something fails.
- Builds also run on save. Change that with `latex-workshop.latex.autoBuild.run`
  if it gets noisy while you are editing `handout.cls`.
- PDFs and aux files go to `1200/latex/build/`, not next to the source.
- The default recipe runs `pdflatex` twice, which is what
  `\pageref{LastPage}` in the `FinalDemos/` headers needs. The labs and homework
  have no cross-references — pick **pdflatex x1 (fast)** from
  `LaTeX Workshop: Build with recipe` if you want them snappier.
- Every `.tex` here is its own root file, `FieldWork/` included, so building is
  always "build the file I am looking at."

## Field work sheets and `reflection.cls`

[reflection.cls](reflection.cls) carries the boilerplate these sheets all
share — the centred heading, the AI usage statement, the signature rule, and the
ruled writing space — so each sheet is a standalone document:

```latex
\documentclass{reflection}

\fieldwork{5}
\topic{Fields}
\duedate{Monday, October 27}

\begin{document}
\maketitle

Go for a walk and find an example of a scalar field...

\ruledlines{19}
\end{document}
```

| | |
|---|---|
| `\fieldwork{5}` | heads the sheet *Physics field work 5* |
| `\reflection{1}` | heads it *Reflection 1:* instead |
| `\topic{…}` | the subtitle under the heading |
| `\duedate{Monday, October 27}` | prints *Due Monday, October 27.*; omit it and the line disappears |
| `\coursename{Astronomy}` | replaces *Physics* in the heading |
| `\ruledlines{19}` | 19 full-width grey rules to write on |
| `\setaistatement{…}` | replaces the AI usage statement wording |
| `\aistatement`, `\signatureline[2in]` | the pieces `\maketitle` emits, if you want them somewhere else |

Class options pass through to `article`, so `\documentclass[12pt]{reflection}`
works.

There is no `main.tex` any more — it existed only to supply a preamble to the
sheets, and `reflection.cls` does that now.

## Adding another course

Copy `build.ps1`, `Makefile`, `.latexmkrc` and `.vscode/` into `<course>/latex/`
unchanged. None of them names a course: the scripts resolve paths against their
own location, and the VS Code settings against `%WORKSPACE_FOLDER%`.

What is not automatic is the **class files**, `handout.cls` and
`reflection.cls`. Each has to sit at the root of its course's `latex/` folder,
because `\documentclass{…}` is resolved from the compiler's working directory
and TeX will not look upward. Copy across whichever the course uses.
`reflection.cls` is course-neutral — `\coursename{}` sets the heading — and
`handout.cls` already declares options for most PHY course numbers, so
`\documentclass[phy2210]{handout}` works without editing it.

One convention the tooling assumes, and it is optional: `Images/` at the folder
root, referenced as `\includegraphics{Images/…}`, with `\graphicspath{{./}{../}}`
in the preamble so a document also compiles when the editor runs from its own
subfolder. `reflection.cls` sets that `\graphicspath` for you.

The repo `.gitignore` tracks `**/.vscode/settings.json` while ignoring the rest
of `.vscode/`, so each course's LaTeX Workshop config travels with the repo
instead of being recreated per machine.

## What a local TeX install needs

Anything in `handout.cls` (used by `FinalDemos/`): `microtype`, `lastpage`,
`hyperref`, `siunitx`, `minted`, `multirow`, `mdwlist`, `mhchem`, `titlesec`,
`fancyhdr`, `parskip`, `charter`, `mathdesign`. TeX Live full and MiKTeX both
have all of these; MiKTeX installs them on first use.

`minted` is loaded but not currently used anywhere. If you do add a code
listing, it needs Python + Pygments and `-shell-escape`.

## Note on this machine's MiKTeX

`pdflatex` works (MiKTeX 26.5). `latexmk` does not:

```
MiKTeX could not find the script engine 'perl' which is required to execute 'latexmk'.
```

MiKTeX ships `latexmk` as a Perl script and does not bundle a Perl interpreter.
Nothing here needs `latexmk` — `build.ps1`, the `Makefile` fallback and the VS
Code recipes all drive `pdflatex` directly, and two passes is enough for every
document in this folder.

If you want `latexmk` anyway (it works out reruns for you, and it is what
Overleaf runs), install [Strawberry Perl](https://strawberryperl.com/) and
reopen your shell. `build.ps1` picks it up automatically.

Also worth knowing: MiKTeX's engines exit with a **non-zero status for
`-version`**, so don't use that as a health check in scripts. A real compile
returns 0.
