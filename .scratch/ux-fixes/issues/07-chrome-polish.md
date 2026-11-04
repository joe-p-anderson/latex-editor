# Chrome polish

Status: ready-for-agent

Spec: [../spec.md](../spec.md#chrome-polish).

## What to build

- **TOOLS label:** the activity bar's "TOOLS" label (`ActivityBar.svelte`) goes from 8.5px to 11px. Check it still fits in the bar.
- **All-sans chrome:** chrome text is all sans. Find serif in chrome (for example the panel tab "Log" in `IndexTabs.svelte` or `ProblemsPanel.svelte`, while "Errors" is sans) and switch it. Document text and Live view keep their serif.
- **Line numbers:** upright, not italic (editor theme). They stay at 12px.
- **Title bar shift:** after the first build, the title bar contents move down about 6px. Find what appears or resizes (probably the build status or error ribbon in `TitleBar.svelte`) and reserve its space so nothing moves.

## Acceptance

- [ ] No chrome element uses a serif face. Check with a DOM query in the running app (`drive.mjs eval`) for computed `font-family` in the title bar, status bar, tabs, panels and sidebar.
- [ ] Line numbers are upright in Source view.
- [ ] Screenshots of the title bar before and after the first build line up to the pixel.

## Comments
