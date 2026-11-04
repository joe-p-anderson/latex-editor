# No-TeX detection and card

Status: resolved

Spec: [../spec.md](../spec.md#no-tex-installed).

## What to build

1. **Detection** in the main process at launch and on demand: find `pdflatex` (and `latexmk` if `src/main/compile.ts` uses it) on PATH, then in the usual MiKTeX locations (`%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64`, `C:\Program Files\MiKTeX\miktex\bin\x64`) and TeX Live's (`C:\texlive\<year>\bin\windows`). Return the distribution name and version, or nothing found. Expose it over IPC.
2. **If nothing is found:**
   - The welcome screen and the empty PDF pane show a card: "endleaf needs a TeX distribution to build PDFs", with links to MiKTeX (https://miktex.org/download) and TeX Live (https://tug.org/texlive/), and a **Check again** button that reruns detection.
   - Build commands are disabled through their `when`. Saving still saves, with no build.
3. **About endleaf** (ticket 03) shows what was found.

## Acceptance

- [ ] With PATH stripped of TeX and the usual folders absent (simulate by overriding detection in a test), the card shows and Build: Recompile is disabled.
- [ ] Ctrl+S saves without trying to build or showing build errors.
- [ ] After installing TeX (or restoring PATH), Check again hides the card and enables building, without a restart.
- [ ] Unit tests cover detection's search order using a fake filesystem.

## Comments

## Comments

Resolved on branch `onboarding` (2026-11-04).
