# Bookplate takes the hovered palette

Status: resolved

Spec: [../spec.md](../spec.md#vault-switcher-bookplate).

## What to build

On the welcome screen (`src/renderer/src/lib/Welcome.svelte`), the bookplate previews the colours of the vault being hovered, not just the marble and logo.

- Compute `appearanceTokens(app, shown, paletteTheme(shown.palette))` (from `@shared/appearance`) using the user's current app appearance, and set the tokens the plate uses (`paper`, `ink`, `ink-soft`, `pencil`, `detail`, `line`, and the Plain look's `p-*` tokens where the plate uses them) as custom properties on the `.plate` element. Welcome will need the app appearance passed in, or read from the same place `App.svelte` reads it.
- `shown` already falls back to the most recent vault, so the plate matches the marble when nothing is hovered.
- Keep the 140 ms hover delay. Add a ~200 ms transition on the plate's `background-color`, `color`, `border-color` and the primary button's colours.
- Nothing outside the plate changes.

## Acceptance

- [ ] Hovering a vault with a different palette changes the plate's paper, ink, ruled border and primary button to that palette after the delay, with a cross-fade.
- [ ] With a black page setting, the plate shows the palette's black-page colours.
- [ ] Moving off the list leaves the plate on the last previewed vault, matching the marble.
- [ ] The rest of the app's colours are unchanged after opening a vault from the list.

## Comments

Built and merged on branch `live-view-fixes` (2026-11-04). Checked in the app by the implementer (all four acceptance items). The primary button follows the hovered palette's ink and paper, which the maintainer confirmed is intended. The cross-fade is skipped under reduced motion. Not yet checked in the running app.
