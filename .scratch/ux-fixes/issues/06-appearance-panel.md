# One Appearance panel

Status: resolved
Blocked by: 02

Spec: [../spec.md](../spec.md#one-appearance-panel).

## What to build

Merge the gear's panel (page and type, `AppearancePanel.svelte`) with the vault swatch's palette and marbling controls into one Appearance panel.

- Sections, in this order: Look, Page, Type (including "Show spaces in Live view" from ticket 05), Palette, Endpaper.
- Mark which settings are app-wide (Look, Page, Type) and which belong to this vault (Palette, Endpaper), e.g. with a section subtitle "This vault". These live in different stores today, and the student should know that changing the palette doesn't change other vaults.
- The gear, Ctrl+, and View → Appearance open the panel at the top. The vault swatch opens it scrolled to Palette.
- Remove the swatch's separate popover.

## Acceptance

- [x] Every appearance control that existed before is in the one panel and still works.
- [x] The swatch opens the panel with Palette in view.
- [x] Ctrl+, opens the panel from the editor, tree and PDF.
- [x] Palette/Endpaper changes still save to `.vault.json`, and Look/Page/Type to app settings.

## Comments

- Ticket 06 (branch ux-fixes-06): `AppearancePanel.svelte` is now one panel: Look, Page, Type (subtitle "All vaults"), then Palette (with the vault name field) and Endpaper (subtitle "This vault · <name>"). File tabs/Desk sit under Look and Binding under Page (Bench only). `focus={section, at}` prop scrolls to top or Palette. App.svelte: `openAppearance('top'|'palette')`; the `appearance` core action, gear and View > Appearance open at top; the activity-bar swatch and status-bar vault chip open at Palette. The separate 'endpaper' view is gone.
- Checked over CDP (port 9406, scratch vault): all five sections render; swatch scrolls to Palette; Ctrl+, from editor, tree and with focus in the page body opens at top (also after the swatch); palette/marbling/tone saved to `.vault.json`, text size/look/showSpaces to settings.json. Focus inside the PDF canvas wasn't truly exercised (the PDF pane wasn't showing), but the key handler is app-wide.
- Pre-existing, not touched: firing several endpaper changes within a few ms can drop one (`setVaultAppearance` writes race in main); `tests/project.test.ts` has 3 failures from fixture drift, and `tsc -p tsconfig.node.json` reports 3 errors around thumbnails.ts/imageSupport.ts. Both are present on `ux-fixes` too.

