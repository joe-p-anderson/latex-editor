# Course syllabi — local builds

Every syllabus in this folder is its own document. Open one, build it, get a
PDF. There is no `main.tex` any more — it existed only to supply a preamble,
and [syllabus.cls](syllabus.cls) does that now. (Same move `1200/latex` made
with `reflection.cls`; see [1200/latex/README.md](../1200/latex/README.md).)

This folder also stays round-trippable with Overleaf: nothing here depends on a
local-only path, so it can be uploaded unchanged.

## Layout

```
syllabi/
├── syllabus.cls              the preamble every syllabus shares
├── Assets/                   logos and textbook covers
├── Pieces/                   shared prose fragments — NOT documents
├── PHY1200_Fundamental/
│   └── PHY1200_F25.tex       one document, one term
├── PHY3300_ThermalPhysics/
│   └── PHY3300_F25.tex
└── …
```

One folder per course, one `.tex` per offering, named `PHY<number>_<term>.tex`.
Next year's version of a course is a new file beside the current one, not an
edit to it.

## VS Code + LaTeX Workshop

**Open this folder as the workspace root** — `File > Open Folder... > syllabi`,
not the repo root. [.vscode/settings.json](.vscode/settings.json) then applies
automatically. It is the same file `1200/latex` uses, unchanged, because it
refers only to `%WORKSPACE_FOLDER%`.

It changes two defaults:

- The build tool gets `"cwd": "%WORKSPACE_FOLDER%"`, so LaTeX Workshop compiles
  from this folder instead of from the document's own folder. This is what makes
  `\documentclass{syllabus}` and every `Assets/…` reference resolve.
- The recipes call `pdflatex` directly instead of `latexmk`, which is a Perl
  script MiKTeX does not bundle. See the note at the bottom.

Day to day:

- Open a syllabus and press `Ctrl+Alt+B` to build, `Ctrl+Alt+V` to open the PDF
  in a tab. `Ctrl+Alt+J` jumps from the source to that spot in the PDF, and
  <kbd>Ctrl</kbd>+click in the PDF jumps back.
- Builds also run on save, so editing `syllabus.cls` rebuilds whichever syllabus
  you have open. Change that with `latex-workshop.latex.autoBuild.run` if it
  gets noisy while you are working on the class.
- PDFs and aux files go to `syllabi/build/`, which is git-ignored.
- One `pdflatex` pass is enough. Nothing here uses `\pageref` or a table of
  contents, so the **pdflatex x1 (fast)** recipe is the one you want.

## Compiling by hand

`\documentclass{syllabus}` is resolved from the compiler's working directory and
TeX will not search upward, so **run the compiler from this folder** — not from
inside a course folder:

```bash
pdflatex -interaction=nonstopmode -output-directory=build PHY1200_Fundamental/PHY1200_F25.tex
```

This is the same constraint `1200/latex` documents for its `FinalDemos/` and
`FieldWork/` sheets, and it is also how Overleaf resolves a project.

There is no batch build script here — syllabi get written and revised one at a
time. If you ever want one, `1200/latex/build.ps1` is course-neutral and would
need only a filter to skip `Pieces/`.

## `syllabus.cls`

Carries the Carthage look: the maroon `CarthageDark` headings, the logo page
header, the unnumbered section style, and the coloured `\textbf` that the tables
and run-in paragraphs depend on. Class options pass through to `article`, so
`\documentclass[12pt]{syllabus}` works.

A syllabus is:

```latex
\documentclass{syllabus}

\begin{document}

\thispagestyle{fancy}
\date{Fall 2025}
\author{}
\title{PHY 3300: Thermal Physics}
\maketitle

\section*{General Information}
…

\end{document}
```

### Course information

| | |
|---|---|
| `\coursecode{PHY 2970}` | prints as itself, so `[\coursecode]` in the email policy stays correct |
| `\meeting{…}` | meeting times row |
| `\officehours{…}` | office hours row |
| `\textbook{title}{author}{publisher}{year}` | the four textbook fields |
| `\prerequisites{…}` | prerequisites row |
| `\office` | `DSC 082`, in one place |
| `\lms` | the LMS name, in one place. Defaults to `Schoology`, which is what the pre-F26 syllabi were written against; the Fall 2026 files each `\renewcommand{\lms}{Brightspace}` in their preamble. Flip the default once nothing needs the old name |
| `\infotable` | the instructor table, built from the above |
| `\infotableport` | portfolio-seminar variant: no textbook row |

These setters redefine themselves, so `\meeting{Tuesday…}` sets the value and a
later bare `\meeting` prints it. Two consequences: setting one twice does not
work, and reading one that was never set swallows the token after it. Both come
from the old `main.tex` and were left alone.

Only four syllabi call `\infotable` or `\infotableport`; the other five still
write the table out by hand. Converting them is a good next step but changes
output, so it was left for a deliberate pass.

### Shared prose

`Pieces/*.tex` are fragments, **not documents** — do not try to compile one.
Reach them through these:

| | |
|---|---|
| `\lettergrades{a) …, b) …}` | the letter-grade table. The fragment ends mid-sentence on "the following criteria:" and this argument finishes it |
| `\latework{Easy}` | one week late, 50% credit |
| `\latework{Partial}` | one week late, 70% credit |
| `\latework{None}` | not accepted, 0 credit |
| `\tipsforsuccess{upper}` | the lecture-course tips |
| `\tipsforsuccess{problem}` | the problem-seminar tips |
| `\collegepolicies` | attendance, academic honour, office hours, then the college boilerplate |
| `\collegepolicies[Other college policies]` | the same, with a heading between the two blocks |

`\latework` and `\tipsforsuccess` take the filename suffix, so a new policy is a
new file in `Pieces/` and needs no edit to the class.

`\collegepolicies` takes no heading by default because six of the nine syllabi
run the two blocks together without one. To give every syllabus the same
heading, change the default in `syllabus.cls` — that is the point of routing it
through one macro.

## What a local TeX install needs

`syllabus.cls` loads: `booktabs`, `geometry`, `tabularx`, `xcolor`, `mathptmx`,
`graphicx`, `titlesec`, `fancyhdr`, `titling`, `enumitem`, `hyperref`. TeX Live
full and MiKTeX both have all of these; MiKTeX installs them on first use.

## Note on this machine's MiKTeX

`pdflatex` works (MiKTeX 26.5). `latexmk` does not:

```
MiKTeX could not find the script engine 'perl' which is required to execute 'latexmk'.
```

MiKTeX ships `latexmk` as a Perl script and does not bundle a Perl interpreter.
Nothing here needs it — the VS Code recipes drive `pdflatex` directly, and one
pass is enough for every document in this folder. [.latexmkrc](.latexmkrc) is
here for the case where you do have `latexmk`, which is what Overleaf runs. If
you want it locally, install [Strawberry Perl](https://strawberryperl.com/) and
reopen your shell.

Also worth knowing: MiKTeX's engines exit with a **non-zero status for
`-version`**, so don't use that as a health check in scripts. A real compile
returns 0.
