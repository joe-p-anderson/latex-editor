# First-time hints

Status: resolved

Spec: [../spec.md](../spec.md#first-time-hints).

## What to build

A small hint mechanism, plus the three hints the spec lists:

- **The strip:** a single dismissible strip under the title bar, with the hint's text and a ×. Only one hint shows at a time. If a second hint is triggered while one is showing, queue it.
- **Dismissal:** dismissing a hint stores its id in app settings, and it never shows again. Help → Show Hints Again clears the stored ids.
- **The three hints**, with the spec's wording:
  1. `live-source`, the first time a `.tex` file opens;
  2. `first-build`, after the first successful build (not when TeX is missing);
  3. `first-error`, the first time the Problems panel opens with an error.

The strip needs to pass the contrast targets from ux-fixes ticket 03 and have `role="status"`.

Keep the hints in one list in code. The spec caps them at three.

## Acceptance

- [ ] On a fresh profile, opening the Getting-started vault shows the Live/Source hint. Saving shows the first-build hint once the first is dismissed or after it.
- [ ] The first build error shows the first-error hint.
- [ ] Dismissed hints don't come back after a restart, and Show Hints Again brings all three back.

## Comments

## Comments

Resolved on branch `onboarding` (2026-11-04).
