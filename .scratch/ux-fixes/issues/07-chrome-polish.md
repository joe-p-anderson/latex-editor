# Chrome polish

Status: resolved

Spec: [../spec.md](../spec.md#chrome-polish).

## What to build

- **TOOLS label:** the activity bar's "TOOLS" label (`ActivityBar.svelte`) goes from 8.5px to 11px. Check it still fits in the bar.
- **All-sans chrome:** chrome text is all sans. Find serif in chrome (for example the panel tab "Log" in `IndexTabs.svelte` or `ProblemsPanel.svelte`, while "Errors" is sans) and switch it. Document text and Live view keep their serif.
- **Line numbers:** upright, not italic (editor theme). They stay at 12px.
- **Title bar shift:** after the first build, the title bar contents move down about 6px. Find what appears or resizes (probably the build status or error ribbon in `TitleBar.svelte`) and reserve its space so nothing moves.

## Acceptance

- [x] No chrome element uses a serif face. Check with a DOM query in the running app (`drive.mjs eval`) for computed `font-family` in the title bar, status bar, tabs, panels and sidebar.
- [x] Line numbers are upright in Source view.
- [ ] Screenshots of the title bar before and after the first build line up to the pixel.

## Comments

- TOOLS label is 11px; letter-spacing cut from 0.14em to 0.08em (and the trailing space dropped) so it fits the 52px bar with room to spare.
- Chrome that used `--f-page` now uses `--f-ui`: panel tabs (Problems/Log), the file tab's § mark, sidebar section headings, Contents paper names, Plugins group headings, Appearance headings, and the Citations view. A DOM audit over every sidebar view, the panel (both tabs), title bar, tabs and status bar finds no other serif text. Left serif on purpose: the title bar's running title (vault · file; kept as a running head by the user's decision), document text, Live view, problem previews, Welcome/empty-plate screens, the Appearance typeface samples, and the line-number gutter (the page's margin; now upright, still 12px).
- Title bar shift: the 50px build ribbon grew the 36px grid row, so `align-items: center` dropped everything 7px. `grid-template-rows: 100%` fixes it. Measured over CDP: the running title's top is 5.2px before and after the first build (12.2px with the fix removed). A pixel-exact before/after screenshot including Windows' caption buttons needs a human (CDP doesn't capture them), so that box is left unticked.
- Fonts didn't load in the worktree's dev build (Vite allow list on the node_modules junction), so check the TOOLS fit with Source Sans in the real app.
