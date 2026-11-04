# One Appearance panel

Status: ready-for-agent
Blocked by: 02

Spec: [../spec.md](../spec.md#one-appearance-panel).

## What to build

Merge the gear's panel (page and type, `AppearancePanel.svelte`) with the vault swatch's palette and marbling controls into one Appearance panel.

- Sections, in this order: Look, Page, Type (including "Show spaces in Live view" from ticket 05), Palette, Endpaper.
- Mark which settings are app-wide (Look, Page, Type) and which belong to this vault (Palette, Endpaper), e.g. with a section subtitle "This vault". These live in different stores today, and the student should know that changing the palette doesn't change other vaults.
- The gear, Ctrl+, and View → Appearance open the panel at the top. The vault swatch opens it scrolled to Palette.
- Remove the swatch's separate popover.

## Acceptance

- [ ] Every appearance control that existed before is in the one panel and still works.
- [ ] The swatch opens the panel with Palette in view.
- [ ] Ctrl+, opens the panel from the editor, tree and PDF.
- [ ] Palette/Endpaper changes still save to `.vault.json`, and Look/Page/Type to app settings.

## Comments
