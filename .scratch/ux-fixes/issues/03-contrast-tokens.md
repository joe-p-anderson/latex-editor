# Contrast targets and test

Status: ready-for-agent

Spec: [../spec.md](../spec.md#contrast).

## What to build

1. **A unit test** (in `tests/`, next to `appearance.test.ts`) that, for every palette × page (palette stock and Black) × look (Plain and Bench), computes the WCAG contrast ratio of each token pair the UI actually draws:
   - text, comments, LaTeX commands, title/status text, inactive Live/Source, sidebar labels, panel text and the count badge must reach **4.5:1**;
   - line numbers, icons and the tab × must reach **3:1**.

   Read the colours from the same functions the UI uses (`plainTokens` in `src/shared/appearance.ts`, the editor theme in `src/renderer/src/lib/editorTheme.ts`, the Live theme in `src/renderer/src/lib/live/theme.ts`, and Bench's tokens). If a colour is only defined in CSS today, move it into a token so the test can read it.
2. **Fix the tokens** until the test passes. Change the `muted`, `faint` and accent derivations in preference to per-palette overrides. Use overrides only where a palette can't otherwise pass (Oxblood and Plum commands on paper).
3. **Re-run** `docs/design/ux-review-measure.js` in the app over the 12 Plain configurations and paste the new table under Comments.

The paper grain isn't in the tokens, so leave a little margin on paper pages (aim for about 4.8:1).

## Acceptance

- [ ] The test exists, covers all 24 configurations (6 palettes × 2 pages × 2 looks), and passes.
- [ ] Temporarily lowering `faint` makes the test fail, naming the palette, page, look and token.
- [ ] The in-app measurement shows no text below 4.5:1 and no line number or icon below 3:1.
- [ ] Comments still read as secondary next to body text (check by eye on Black and on Cream wove).

## Comments
