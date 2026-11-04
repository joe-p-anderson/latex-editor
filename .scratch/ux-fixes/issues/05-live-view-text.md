# Live view text: ragged-right, space dots off

Status: ready-for-agent

Spec: [../spec.md](../spec.md#live-view-text).

## What to build

- Remove justification from Live view prose (`textAlign: 'justify'` in `src/renderer/src/lib/live/theme.ts`). Text is ragged-right everywhere.
- Make the space dots (`src/renderer/src/lib/live/live.ts`, around line 378) depend on a new app setting, "Show spaces in Live view", which is **off** by default. Put the setting in the Appearance panel's Type section, or in the gear panel if ticket 06 hasn't landed yet. Persist it with the other app appearance settings.

## Acceptance

- [ ] A fresh profile shows Live view prose ragged-right with no dots.
- [ ] Turning the setting on shows the dots immediately, without reopening the file, and the choice survives a restart.
- [ ] Source view is unchanged.

## Comments
