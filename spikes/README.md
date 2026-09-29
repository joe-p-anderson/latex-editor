# Spikes

## Compile pipeline (`compile.ps1`)

Question: can MiKTeX build a vault document with
- the document class taken from a shared template library instead of a copy in the vault,
- aux, log and synctex files kept out of the source tree,
- the PDF in a mirrored `pdf/` tree,

while SyncTeX still works? **Yes.** Run it like this:

```powershell
.\spikes\compile.ps1 -Vault fixtures\vaults\1200-latex -Tex Homework\HW3_vectors.tex
```

What the script does:
- `Set-Location <vault>`, so `Images/...` resolves from the vault root the same way it did before.
- `TEXINPUTS=<templates>//;` finds the classes. The `//` searches subfolders, and the trailing `;` keeps MiKTeX's default search path.
- `pdflatex -aux-directory=.texcache/<reldir>/<name> -output-directory=<same>` builds everything into the cache.
- It reruns while the log (checked case-sensitively) says `Rerun to get`, `Label(s) may have changed` or `Rerun LaTeX`, up to 4 passes.
- It copies the PDF to `pdf/<reldir>/<name>.pdf`.

### Results

| Document | Passes | Class loaded from | Pages (new / old `build/`) |
|---|---|---|---|
| `1200-latex/Homework/HW3_vectors.tex` | 2 | `_templates/handout.cls` | 5 / 5 |
| `1200-latex/FinalDemos/BlueSky.tex` | 2 | `_templates/handout.cls` | 2 / 2 |
| `syllabi/PHY1200_Fundamental/PHY1200_F26.tex` | 2 | `_templates/syllabus.cls` | 5 / 5 |

- The vaults hold no `.cls` files. Every class came from `_templates/`, confirmed by the paths in each log.
- After compiling, the only new paths in the vaults are `.texcache/` and `pdf/`.
- A recompile with warm aux files takes 1 pass, so rerun detection responds to the log instead of always running twice.

### SyncTeX

- **Inverse search** (PDF to source) works: `synctex edit -o 1:300:400:<cache pdf>` returns the absolute `.tex` path and line.
- **Forward search** (source to PDF) works **only with an absolute input path**, e.g. `synctex view -i 30:0:C:/.../Homework/HW3_vectors.tex -o <cache pdf>`. Relative paths return nothing, because the synctex file records absolute paths. The app will always pass absolute paths.
- SyncTeX has to be pointed at the **cache PDF**, which sits next to its `.synctex.gz`. The PDF.js viewer should also load the cache PDF. `pdf/` holds the copy meant for people to open.

### Layout decision: `cache`, not `pdfout`

`-Layout pdfout` (`-output-directory=pdf/<reldir>`) also writes `.synctex.gz` into `pdf/`, cluttering the folder meant to stay clean. So the `cache` layout, with a copy into `pdf/`, is the design.

## Template merge (`fixtures/_templates/`)

- **`handout.cls`:** the 1200 copy was a **strict superset** of the version shared by the other nine courses (2200–4960), with no conflicts. It adds:
  - the `[noname]` class option, which drops the "Name ____" header;
  - `\lectureactivity` boilerplate;
  - bold `[n]` question labels (`\questionlabel`), with a matching `\leftmargin` fix in `\questionshook`.

  The 1200 version was taken, with its line endings normalized from CRLF to LF. **This changes how the other nine courses look:** their questions will render as bold `[1]` instead of `1.`.
- The default `\hd@course{Physics 1200}` is fine: the nine other courses override it with a per-course `course.cfg`, and that file stays in the vault. The pattern is per-course settings in the vault and the shared class in the library.
- **`reflection.cls`** was identical in all 10 courses and was copied once.
- **`syllabus.cls`** came from `syllabi/`.

## Found along the way (to feed the log rules knowledge base)

- `BlueSky.tex` uses `\documentclass[phy1200]{handout}`, but `handout.cls` doesn't declare that option. It gets passed on to `exam` and ignored, producing "Unused global option(s)". It's a good test case for explaining warnings.
- The syllabus logs `fancyhdr Warning: \headheight is too small`. That's a real fix in `syllabus.cls`.
- `fixtures/logs/` holds 59 real `.log` files from both old `build/` folders, to use as the parser test set.

## SyncTeX: an in-process parser instead of the CLI

MiKTeX's `synctex` tool gives correct answers, but **every call costs about 570 ms**, even one that fails immediately. That's MiKTeX's process start-up, and it's too slow for a double-click. `src/main/synctex.ts` reads `.synctex.gz` directly instead. Parsing is cached until the next compile, and each lookup takes microseconds.

**Accuracy (round trip).** For every content line L in a document:
1. jump forward from L to its highlight;
2. "double-click" the middle of that highlight;
3. check which line comes back.

| Document | Mine: same line | Mine: within 1 | CLI: same line | CLI: within 1 |
|---|---|---|---|---|
| `Homework/HW3_vectors.tex` (75 lines) | 60% | 91% | 60% | 84% |
| `PHY1200_F26.tex` (68 lines) | 62% | 74% | 56% | 60% |

The CLI figures come from a sample of 25 lines per document.

Most of the remaining misses aren't really wrong. Preamble lines like `\title{…}` only produce output through `\maketitle`, so clicking the title lands on `\maketitle`.

In the app, six double-clicks on HW3 all landed on the exact line: a section heading, a question, two parts, an image and a page-2 paragraph.

**Inherent SyncTeX behaviour:** page headers and footers are credited to the source line that triggered the page break, e.g. a `\clearpage`, not to the `.cls` file that defines them. The CLI does the same.

**Testing note:** the dev machine runs at 125% display scaling. Screenshot coordinates are device pixels, while mouse events use CSS pixels, so divide by 1.25.
