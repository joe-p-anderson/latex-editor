# Three syntax roles

Status: ready-for-agent
Blocked by: 03

Spec: [../spec.md](../spec.md#syntax-roles).

## What to build

Split Source view's single LaTeX accent into three roles, each with its own colour per palette, page and look:

1. **Commands**: `\frac`, `\section`, `\alpha`.
2. **Structure**: environment names in `\begin{…}`/`\end{…}`, and label/ref/cite keys.
3. **Maths content**: the inside of inline and display maths.

Braces stay dimmed. Add the three tokens to the contrast test from ticket 03 at 4.5:1. Find where the highlighter assigns tags in `src/renderer/src/lib/editorTheme.ts` and the LaTeX language definition it styles.

## Acceptance

- [x] In Source view, `\begin{align}`, `\alpha` and `x^2` inside `$…$` are three visibly different colours in every palette.
- [x] The contrast test covers all three roles and passes.
- [x] Live view's source-under-cursor uses the same roles.

## Comments

- `src/renderer/src/lib/latexLanguage.ts` wraps stex and sorts its tokens into `roles.command` / `roles.structure` / `roles.math` (tested in `tests/latexLanguage.test.ts`). Maths covers `$…$`, `$$…$$`, `\(…\)`, `\[…\]` and maths environments (equation, align, gather, multline… and starred forms); commands inside maths stay commands. Numbers in prose are no longer coloured.
- New `--structure` token; `--math` is redone. Both come from `syntaxInks()` in `src/shared/appearance.ts`: maths prefers blue and structure green, each turned at least 75° of hue away from the detail and from each other, then held to the contrast target. On the Bookbinder's Blue paper page maths turns plum, because the detail is already blue. Live's rendered maths and cite chips use `--math`, so they change colour too. `--p-math` is gone (nothing used it).
- `tests/contrast.test.ts` covers structure and maths on paper, srcbg and the cursor line, and checks that the three roles are at least ΔE 20 apart in all 24 configs.
- Checked by eye in the app (Plain look, Forest Floor, black and Natural pages), in both Source and Live's source block. The other palettes are checked only by the tests.
