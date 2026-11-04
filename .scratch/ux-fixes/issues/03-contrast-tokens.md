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

- [x] The test exists, covers all 24 configurations (6 palettes × 2 pages × 2 looks), and passes.
- [x] Temporarily lowering `faint` makes the test fail, naming the palette, page, look and token.
- [x] The in-app measurement shows no text below 4.5:1 and no line number or icon below 3:1.
- [x] Comments still read as secondary next to body text (check by eye on Black and on Cream wove).

## Comments

**Done (ux-fixes-03).** I added `tests/contrast.test.ts`. It builds the tokens with `appearanceTokens` for all 24 palette × page × look configurations, plus Bench's linen binding on paper. It then checks every pair the UI draws: text against 4.5:1 (4.8:1 on grained paper pages) and graphics against 3:1. The editor and Live colours are read from `editorColours` and `liveColours` in `src/shared/appearance.ts`, which `editorTheme.ts` and `live/theme.ts` now import. A failure names the palette, page, look, the item, the tokens and the ratio. To confirm the test catches a bad change, I set `faint` to a flat `mix(text, page, 0.8)`; the test then failed 12 configurations, with messages like "autumn-ember paper plain: comments (pencil on paper) is 1.48:1, needs 4.8:1".

**Token fixes.** There are no per-palette overrides. A new `atLeast()` pulls a colour toward the text only as far as it needs to reach its target against every background it is drawn on. Where a palette already passes, its usual mix is kept.
- `muted` and `faint` are now set by a target. `faint` must reach 4.5 on Black and 4.8 on paper. `muted` must reach 1.0 more than that, so comments still read as the quieter ink. The derivation aims 0.1 above each target, because the browser's `color-mix()` rounds differently.
- `accent` and `math` are also held to targets. This fixes the commands on Oxblood and Plum paper.
- Plain's secondary chrome text is now held against the bar it actually sits on.
- Bench's `ink-soft`, `pencil`, `detail` and `math` get the same treatment.
- Bench saddle leather is a little lighter (#B8804E) and its inks darker. The old values could not reach 4.5:1.
- Linen's active colour is the detail colour, darkened until it reaches 4.5:1.
- On paper pages, `warn` is now #8A5C00.
- The warning count badge text is now drawn in `var(--paper)`.

**In-app re-run** (Plain, source mode, `docs/design/ux-review-measure.js`). Panel text and badges were measured by walking the Problems panel. I left out the disabled ‹ › buttons (opacity 0.35, which WCAG exempts) and the ribbon's icon, which sits on its silk and isn't measured correctly. The table takes the review's column layout and adds an icons column.

| Palette | Page | Body | LaTeX commands | Comments | Line numbers | Title & status text | Sidebar labels | Tab × | Panel text | Count badge | Icons |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Autumn Ember | Cream wove | 14.1 | 6.4 | 5.5 | 5.5 | 4.6 | 6.7 | 5.2 | 6.7 | 4.7 | 4.6 |
| Autumn Ember | Black | 10.9 | 5.1 | 5.2 | 5.2 | 8.1 | 7.5 | 7.6 | 6.3 | 6.0 | 7.5 |
| Bookbinder's Blue | Bright white | 15.0 | 7.2 | 5.3 | 5.3 | 4.5 | 6.6 | 5.2 | 6.6 | 5.0 | 4.5 |
| Bookbinder's Blue | Black | 11.8 | 8.5 | 5.3 | 5.3 | 7.8 | 7.5 | 7.3 | 6.5 | 6.3 | 7.5 |
| Oxblood & Gilt | Ivory laid | 12.8 | 6.1 | 5.3 | 5.3 | 4.5 | 6.5 | 5.0 | 6.5 | 4.9 | 4.5 |
| Oxblood & Gilt | Black | 12.7 | 7.7 | 5.2 | 5.2 | 7.5 | 7.2 | 7.0 | 6.3 | 6.8 | 7.2 |
| Forest Floor | Natural | 14.3 | 5.7 | 5.2 | 5.2 | 4.7 | 6.4 | 5.3 | 6.4 | 4.9 | 4.7 |
| Forest Floor | Black | 11.2 | 5.2 | 5.1 | 5.1 | 7.6 | 7.3 | 7.1 | 6.2 | 6.2 | 7.3 |
| Plum & Amber | Soft white | 13.1 | 5.8 | 5.3 | 5.3 | 4.5 | 6.4 | 5.2 | 6.4 | 4.9 | 4.5 |
| Plum & Amber | Black | 12.4 | 6.7 | 5.1 | 5.1 | 7.3 | 7.1 | 7.0 | 6.2 | 6.8 | 7.1 |
| Slate & Ember | Cool white | 14.4 | 5.7 | 5.3 | 5.3 | 5.0 | 6.5 | 5.5 | 6.5 | 5.0 | 5.0 |
| Slate & Ember | Black | 11.4 | 4.6 | 5.1 | 5.1 | 7.4 | 7.1 | 7.1 | 6.2 | 6.5 | 7.1 |

Every value is the lowest in its configuration, except body text, which is the median. The Autumn and Slate rows come from the final build. The other rows come from the run just before the 0.1 aim margin was added; that margin only raises ratios. In those earlier runs, the lowest value outside the editor was 4.51 and inside it was 4.49, on the Slate Black cursor line. The margin fixed that one, and it now measures 4.6. The paper grain is left out of these numbers, so the test keeps a 0.3 margin on paper pages.

**Left for a human.**
- The hot warning badge never appeared in the app, because the Preview build reports no warnings. Its colours (paper on warn) are covered only by the unit test.
- I didn't measure Bench in the app. The unit test covers it.
- On Black, comments (faint, about 5.1:1) and braces and labels (muted, about 6:1) are now fairly close. Comments still read as secondary in screenshots on Black and Cream wove, but it's worth a look by eye.
- The saddle leather is a little lighter than before. Please check it by eye in Bench.

