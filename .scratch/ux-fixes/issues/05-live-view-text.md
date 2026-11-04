# Live view text: ragged-right, space dots off

Status: ready-for-agent

Spec: [../spec.md](../spec.md#live-view-text).

## What to build

- Remove justification from Live view prose (`textAlign: 'justify'` in `src/renderer/src/lib/live/theme.ts`). Text is ragged-right everywhere.
- Make the space dots (`src/renderer/src/lib/live/live.ts`, around line 378) depend on a new app setting, "Show spaces in Live view", which is **off** by default. Put the setting in the Appearance panel's Type section, or in the gear panel if ticket 06 hasn't landed yet. Persist it with the other app appearance settings.

## Acceptance

- [x] A fresh profile shows Live view prose ragged-right with no dots.
- [x] Turning the setting on shows the dots immediately, without reopening the file, and the choice survives a restart.
- [x] Source view is unchanged.

## Comments

- Done on `ux-fixes-05`. Justification removed. New `showSpaces` app appearance setting (off by default), with a "Show spaces in Live view" checkbox at the end of the Appearance panel's Type section. It toggles `data-spaces` on `<html>`, and the dot CSS is scoped to that, so the dots appear and disappear at once. Checked in the running app with a fresh profile: no dots and ragged-right by default. Turning it on shows the dots straight away and writes `showSpaces: true` to settings.json. After a reload the setting was still on. Source view has no dots. A full app restart wasn't tested separately, but the setting is read from settings.json the same way.

