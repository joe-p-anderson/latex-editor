# `physicsinprogress.cls`

A document class for *Physics in Progress* (Carthage College, Department of
Physics and Astronomy). It wraps `revtex4-2` and supplies the journal furniture
that used to be copy-pasted into the top of every manuscript: the first-page
banner, the Editor's Suggestion flag and red border, the running heads, and the
standard package set.

The point of it is that the two editorial variables — **Editor's Suggestion**
and **article type** — become class options instead of a choice between four
pre-rendered artwork PDFs.

The same class also builds the whole issue: `issue.tex` in the project root
pulls in every manuscript and numbers the pages straight through. See
[Building the whole issue](#building-the-whole-issue).

---

## Quick start

```latex
%PIP-412035RC020
\documentclass[rc,ec]{physicsinprogress}

\pipvolume{2}
\pipissuedate{Feb. 2026}

\begin{document}

\title{It takes two: finding the normal modes in a coupled pendulum system}
\author{Brookelyn H Velmont}
\affiliation{%
Department of Physics and Astronomy, Carthage College, 2001 Alford Park Drive,
Kenosha, WI 53140, USA
}%
\pipdates{January 29, 2026}{February 5, 2026}

\begin{abstract}
...
\end{abstract}

\maketitle

\section{Introduction}
...

\bibliography{bib}

\end{document}
```

`template.tex` in the project root is a working copy of this you can duplicate.

---

## Class options

| Option | Effect |
|---|---|
| `ec` | Editor's Suggestion: red double border around page 1, and the flag replaces the journal name in the top-left of the banner |
| `noec` | No border, no flag — top-left reads "Physics in Progress" **(default)** |
| `rc` | Article type is "Rapid Communication" |
| `oa` | Article type is "Original Article" **(default)** |
| `issue` | This document is the whole-issue driver, not an article — see [below](#building-the-whole-issue) |

`editorschoice`, `rapidcommunication` and `originalarticle` work as long-form
aliases. The article type appears top-right on page 1 and in the running head on
every page after it.

Anything the class doesn't recognise is passed through to `revtex4-2`, so
`\documentclass[rc,ec,longbibliography]{physicsinprogress}` does what you'd
expect. Two exceptions: `preprint` and `onecolumn` are rejected with an
explanatory error, because the class loads revtex with `reprint` itself and the
combination is contradictory. `footinbib` is on by default; pass `nofootinbib`
to turn it off.

---

## Macros

### Issue identification

```latex
\pipvolume{2}          % volume number
\pipissuedate{Feb. 2026}
\pipissuenumber{1}     % optional; omit unless the issue is numbered
```

These build the running head on the left of odd pages:

- without an issue number — *Phys. in Prog.* **2** (Feb. 2026)
- with one — *Phys. in Prog.* **1** 1 (Jan. 2024)

If you need something the pieces don't cover, `\pipcitation{...}` replaces the
whole line.

### Received / published dates

```latex
\pipdates{January 29, 2026}{February 5, 2026}
```

Put this immediately after `\affiliation`, where you'd otherwise write
`\collaboration`. revtex has no field for these dates, so the journal has always
smuggled them in through `\collaboration`, which typesets a line under the
affiliation; `\pipdates` just does that for you with the wording fixed.

revtex emits `Warning: Assuming \noaffiliation for collaboration` when you use
it. That is expected and harmless — the hand-written preambles produced exactly
the same warning.

### Escape hatches

```latex
\articletypename{Comment}   % an article type the rc/oa options don't cover
\journallogo{OtherLogo.pdf} % a different logo file
```

---

## Where the file goes

**On Overleaf** (how this project is built): put `physicsinprogress.cls` in the
project root, next to `Logo.pdf`. Manuscripts in `Manuscripts/<name>/` find it
with plain `\documentclass{physicsinprogress}` — no path prefix — because
Overleaf searches the project root as well as the document's own folder. That's
the same reason `\includegraphics{Logo.pdf}` already works from a subfolder.

**Locally**, a bare `pdflatex Manuscripts/BV_CoupledPendulum/manuscript.tex`
will *not* find either the class or `Logo.pdf`, because plain TeX distributions
don't search the project root. Either compile from a directory containing both,
or point `TEXINPUTS` at the root (note the trailing `:` / `;`, which means "and
the normal places too"):

```bash
TEXINPUTS=/path/to/Physics_in_Progress_Issue_2:  pdflatex manuscript.tex
```

For a permanent local install, drop the `.cls` in
`texmf/tex/latex/physicsinprogress/` inside your local texmf tree and refresh
the filename database.

---

## Building the whole issue

`issue.tex` in the project root is the whole of Volume 2 as one PDF, with the
page numbers running from the first article to the last:

```latex
\documentclass[issue]{physicsinprogress}

\pipvolume{2}
\pipissuedate{Feb. 2026}

\usepackage{siunitx}

\begin{document}

\pipaddarticle{Manuscripts/BV_CoupledPendulum}
\pipaddarticle[Manuscript]{Manuscripts/Semaje_PhotoElect}
...

\end{document}
```

`\pipaddarticle{<folder>}` pulls in `<folder>/manuscript.tex`. The optional
argument is the file's base name, for the one manuscript that is called
`Manuscript.tex` instead. Articles come out in the order they are listed, each
starting on a new page.

The manuscripts are **not** modified for this — each one is still a standalone
document that compiles on its own. What the class does is `\include` the file
and throw away everything from `\documentclass` down to `\begin{document}`,
after reading the option list off that `\documentclass` line. So a manuscript's
`rc`/`ec` settings stay with the manuscript: to move an article to Editor's
Suggestion you edit its own `\documentclass`, and both its standalone PDF and
the issue follow.

### What you need to know

- **A manuscript's own preamble is skipped**, so anything it sets there has to
  move to `issue.tex`: `\usepackage` lines, custom macros, `\setlength`,
  `\articletypename`. Only `ec`/`noec` and `rc`/`oa` survive, and only from the
  `\documentclass` line. Anything else on that line gets a
  `Class physicsinprogress Warning: Ignoring option ...`.
- **`\label` keys must be unique across the issue.** LaTeX says
  `Label 'x' multiply defined` when they are not. (revtex's own internal
  `FirstPage` and `LastBibItem` labels are handled by the class.) Citation keys
  do *not* have to be unique — two articles can cite the same key and each gets
  its own number.
- **Each article keeps its own reference list**, numbered from 1, via
  `chapterbib`. That needs one BibTeX run per article, which `latexmk` does for
  you. If you drive the build by hand you need `bibtex` on each
  `Manuscripts/<name>/manuscript.aux` as well as `pdflatex` on `issue.tex`.
- **`latexmkrc` in the project root is part of the build.** It sets
  `$bibtex_fudge = 0` so that BibTeX runs from the project root. Without it
  latexmk chdir's into each article's folder first, and the database paths the
  class writes stop resolving. Resolving them by search path instead is not an
  option: several manuscripts call their database `bib.bib`, and BibTeX would
  hand an article somebody else's references without saying so. Compiling a
  single manuscript on its own does not depend on this file.

On Overleaf, set `issue.tex` as the main document to build the issue, or a
manuscript's own `manuscript.tex` to build just that article.

Volume 2 comes out at 28 pages, which is exactly the sum of the nine articles'
standalone page counts — no blank pages are inserted between them.

---

## Converting an existing manuscript

All nine manuscripts in `Manuscripts/` have been converted. For a new one:
delete everything from `\documentclass` down to `\begin{document}` and replace
it with the five lines from the Quick start. Then, in the body:

- remove the hand-typed `\vspace*{25pt}` after `\begin{document}` — the class
  applies it via `\piptitledrop`;
- replace `\collaboration{Received ..., Published online ...}` with
  `\pipdates{...}{...}`.

`Manuscripts/BV_CoupledPendulum/manuscript_oldpreamble.tex` is kept as a record
of what the old hand-written preamble looked like. Each preamble went from 66
lines to 7, and the output is pixel-identical to the old version.

The `rc`/`ec` options each manuscript now carries were read off the banner
artwork it used to import: `RC_def.pdf` → `rc`, `EC_RC.pdf` → `rc,ec`. Note
that three of them (`Semaje_ElecDiff`, `Semaje_PhotoElect`, `SF_Interferometer`)
carry a `%PIP-...OA046` tracking comment on line 1 that says "OA" while the
artwork, and the running head they had hand-coded, both said Rapid
Communication. The artwork was followed, since that is what the published pages
actually showed; if the comment is right instead, change `rc` to `oa` in those
three `\documentclass` lines.

Note that the old preambles carried a `\fancypagestyle{plain}{...}` block that
never did anything: revtex typesets the title page under its own `titlepage`
page style and never consults `plain`, so the first-page banner came entirely
from the background artwork. There's nothing to carry across.

`siunitx` is deliberately **not** loaded by the class — not every article needs
it, and recent versions want a newer `expl3` than some of our TeX installations
ship. Add `\usepackage{siunitx}` yourself if you use it.

---

## Tuning the banner

All of these are lengths, so `\setlength` them in the document preamble.

| Length | Default | Meaning |
|---|---|---|
| `\pipbannerdrop` | `77.2pt` | paper top down to the banner baseline |
| `\piplogoheight` | `1.5cm` | height of the logo |
| `\piptitledrop` | `25pt` | extra space before the title on page 1 |
| `\pipbannerhshift` | `0pt` | nudge the whole banner sideways |
| `\piplogohshift` | `0pt` | nudge only the CARTHAGE/logo/COLLEGE group |
| `\pipborderxsep` | `25.25pt` | EC border inset, left and right |
| `\pipborderysep` | `25.1pt` | EC border inset, top and bottom |
| `\pipbordergap` | `1.75pt` | gap between the two border rules |
| `\pipborderrule` | `1pt` | border rule thickness |

### Known differences from the Volume 1 artwork

The class typesets the banner rather than importing `RC_def.pdf` and friends, so
it is not bit-identical to Volume 1. Measured at 110 dpi:

- **The flags match.** "Editor's Suggestion" / "Physics in Progress" on the left
  and the article type on the right land within 1 px of the artwork.
- **The logo group sits about 9.2pt further right.** In the artwork it is
  off-centre; roughly 4.5pt of that is a stray trailing space in the old
  `\fancyhead[C]{...COLLEGE }` code, and the rest appears to be hand-placed. The
  class centres it properly instead. To reproduce the old position exactly:
  ```latex
  \setlength{\piplogohshift}{-9.2pt}
  ```
- **The EC border is symmetric.** The artwork's is not — its insets are 25.3pt
  left against 28.9pt right, and 23.3pt top against 29.2pt bottom, because the
  artwork PDFs are 613×793pt being centred on a 612×792pt page. The class uses
  equal insets on all four sides.

The running heads on page 2 and after are pixel-identical to the old output.

One inherited oddity is preserved on purpose: the journal name is set in FULL
capitals in the running head but in true small capitals on the banner, because
the old preamble wrote `\scshape{PHYSICS IN PROGRESS}` — already uppercase, so
`\scshape` had nothing to shrink. If you'd rather the two agree, drop the
`\MakeUppercase` from the `\fancyhead[C]` line in the class.

---

## Requirements

LaTeX 2020/10/01 or newer (for the `shipout/background` kernel hook used to
place the banner), plus `revtex4-2`. Full-issue mode also loads `chapterbib`,
and wants `latexmk` to drive the build. Overleaf's default TeX Live is fine.

The class deliberately does **not** use the `background` package any more. Its
first-page mechanism goes through `everypage`, which on a current kernel is a
shim over `\AddToHookNext{shipout/background}`; whether the banner survived to
the first shipout turned out to depend on what else the document loaded. A
manuscript with no extra `\usepackage` lines silently produced no banner at all,
while the same file plus one unrelated package rendered fine.
