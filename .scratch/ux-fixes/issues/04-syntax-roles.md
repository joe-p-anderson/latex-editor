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

- [ ] In Source view, `\begin{align}`, `\alpha` and `x^2` inside `$…$` are three visibly different colours in every palette.
- [ ] The contrast test covers all three roles and passes.
- [ ] Live view's source-under-cursor uses the same roles.

## Comments
