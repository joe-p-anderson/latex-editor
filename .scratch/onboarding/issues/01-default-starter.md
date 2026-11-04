# Lab report starter and default starters

Status: resolved

Spec: [../spec.md](../spec.md#lab-report-starter-and-default-starters).

## What to build

1. **Add the built-in "Lab report (revtex)" starter** to `BUILT_IN` in `src/main/starters.ts`, with the content the spec lists, using `{{Title}}`/`{{Author}}` placeholders like Article.
   - Choosing it in the New file dialog also creates `references.bib` beside it, with one example entry, if no such file exists.
   - It must build cleanly with a stock MiKTeX install (revtex4-2, siunitx, amsmath, graphicx). Use a placeholder figure that needs no image file: comment out the `\includegraphics` line with a note, or use `example-image` from the mwe package if that's present.
2. **Per-vault default:** add `defaultStarter` (a starter name) to `.vault.json` (see `src/shared/appearance.ts` / `src/main/vault.ts` for how it's read and written).
   - `NewFileDialog.svelte` preselects the vault's default, else the app-wide default.
   - Right-clicking a starter in the dialog offers "Use as this vault's default".
3. **App-wide default:** add a `defaultStarter` app setting, which defaults to "Lab report (revtex)".

Use the term "starter", not "template", in all UI text ([GLOSSARY.md](../../../GLOSSARY.md)).

## Acceptance

- [ ] Ctrl+N in a vault with no `defaultStarter` preselects Lab report (revtex).
- [ ] After "Use as this vault's default" on Article, Ctrl+N preselects Article in that vault only.
- [ ] A new lab report builds with no errors on MiKTeX.
- [ ] A test in `tests/` covers starter listing with a default, and the `.vault.json` round-trip.

## Comments

## Comments

Resolved on branch `onboarding` (2026-11-04).
