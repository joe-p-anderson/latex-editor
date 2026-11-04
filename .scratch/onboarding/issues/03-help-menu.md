# Help menu and Keyboard Shortcuts panel

Status: resolved
Blocked by: ux-fixes 01, ux-fixes 02

Spec: [../spec.md](../spec.md#help-menu).

## What to build

Register Help commands in the command registry, so they appear in the Help menu and the palette:

- **Keyboard Shortcuts** (Ctrl+K Ctrl+S, a two-key chord as in VS Code). This opens a panel listing every command that has a key, grouped by category, with a search box that matches the title, category or key text ("ctrl+shift"). It's read-only, with no rebinding. Build it like `QuickOpen.svelte`, as an overlay, or as an editor tab if that's simpler.
- **Getting Started**: calls the Getting-started vault opener from ticket 04. Until that lands, leave the command disabled.
- **Math Shortcuts…**: the existing command, moved out of Edit.
- **Show Hints Again**: clears hint dismissals (ticket 06). Disable it until that lands.
- **Report an Issue…**: opens `https://github.com/joe-p-anderson/latex-editor/issues/new` in the browser, with `body` prefilled with the app version and OS. No personal data.
- **About endleaf**: a small dialog with the version, Electron/Chromium versions and the TeX distribution found (ticket 05, or "unknown" until it lands).

If the registry doesn't support chords yet, add them: the first key arms the chord, the second runs it, and Escape or any other key cancels.

## Acceptance

- [ ] Help shows the six items, in the order above.
- [ ] Ctrl+K then Ctrl+S opens the shortcuts panel. Ctrl+K followed by another key does nothing harmful.
- [ ] The panel lists Build: Recompile with Ctrl+Shift+B and Edit: Find in Vault with Ctrl+Shift+F. Typing "figure" finds Insert Figure with Ctrl+Alt+F.
- [ ] The panel is generated from the registry: a test adds a command with a key and sees it listed.

## Comments

## Comments

Resolved on branch `onboarding` (2026-11-04).
