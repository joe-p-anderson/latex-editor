# Folder starters

Follows [onboarding](../onboarding/spec.md). Today a starter is one file, the built-in starters are string literals in `src/main/starters.ts`, and only a built-in starter can bring extra files (the Lab report's `references.bib`, through `companions`). The maintainer wants to edit the starters as files, without opening code, and wants starters that lay out more than one file.

## Goals

- A starter can be a folder of files, so a new vault can start as a whole layout (a `main.tex` that `\input`s section files, a `references.bib`, a figures folder).
- Every built-in starter is a file or folder under `resources/starters/`, packaged with the app. No starter text lives in code.
- The same folder format works in a template folder's `starters/` (global and per vault), so a user can make their own.
- More built-in shapes for a physics student (below).

## Non-goals

- A UI for editing starters. They're edited as files.
- Overwriting files that already exist. A starter never replaces a file.

## Design

### The folder format

- A starter is either a single file (as today) or a folder, in `resources/starters/` or in `starters/` under a template folder. The starter's name is the file's name without its extension, or the folder's name.
- A folder starter's **entry file** is its `main.tex`, or, failing that, its only top-level `.tex` file. A folder with neither isn't a starter and is skipped. The entry file is what New vault opens and what New file names after the name the user types.
- The description is the entry file's `%% starter:` first line, as for single files, and is stripped on copy.
- Placeholders (`{{Title}}`, `{{Name|default}}`, `{{date}}`, `{{filename}}`, `{{basename}}`) are filled in every text file in the folder (`.tex`, `.bib`, `.md`, `.txt`, `.cls`, `.sty`, `.bst`). The dialog asks for each field once, across all files. Other files (images, PDFs) are copied byte for byte.
- `{{filename}}` and `{{basename}}` always mean the entry file's.
- A file named `.keep` is never copied; it only lets an otherwise empty folder (e.g. `figures/`) be shipped in git, and the folder is still created.

### Using a folder starter

- **New vault** copies the whole folder into the vault root, then opens the entry file as `main.tex` (onboarding ticket 02's steps 2–3 are otherwise unchanged).
- **New file** creates the entry file under the typed name and the folder's other files relative to it, each only if no file of that path exists. This replaces `companions`, which goes away.
- The New file dialog shows a folder starter with a small marker that it makes several files, and lists them in its description area.

### Built-in starters as files

- Move every entry of `BUILT_IN` to `resources/starters/`, packaged by `electron-builder.yml` the way `resources/getting-started/` is. In development they're read from the repo, so editing a file and reopening the dialog shows the change.
- The Lab report (revtex) becomes a folder (`main.tex`, `references.bib`, `figures/.keep`); its `\includegraphics` path uses `figures/`.
- Built-ins keep `source: 'built-in'`. Plugin starters are unchanged.
- A user or vault starter with the same name as a built-in one replaces it in the list (today both show). The default-starter rule (a user's wins) is unchanged.

### Built-in shapes

Single files: Blank LaTeX file, Section, Article, Standalone figure, Handout, Bibliography, Markdown note, Plain text (all as today).

Folders:

- **Lab report (revtex)**: as onboarding ticket 01, plus `figures/`.
- **Long lab report (revtex)**: the same front matter, with each section in `sections/` (`introduction.tex`, `theory.tex`, `methods.tex`, `results.tex`, `conclusion.tex`, `appendix.tex`) brought in by `\input`, plus `references.bib` and `figures/`. The comments in `main.tex` say how `\input` works.

Each folder starter must build with a stock MiKTeX install, without image files (use a framed box in place of a figure, as the Lab report does).

## Tickets

1. [Folder starters, and built-ins as files](issues/01-folder-starters.md)
2. [New built-in shapes](issues/02-starter-shapes.md)

Problem set and Presentation (beamer) were built, then removed (2026-11-04): Live view doesn't support their classes well enough yet.
