# New vault flow

Status: resolved
Blocked by: 01

Spec: [../spec.md](../spec.md#new-vault-flow).

## What to build

After New vault…'s folder picker (`Welcome.svelte` `onnew`, and the main-process handler it calls):

1. If the folder already contains `.tex` files, open it as an existing vault and stop.
2. Otherwise, show a short dialog (reuse `PromptDialog.svelte` or the New file dialog's look) with a **Name** field, defaulting to the folder name, and a **Starter** list, preselected to the app-wide default.
3. Write `.vault.json` with `defaultStarter` and the usual random appearance.
4. Create `main.tex` (and `references.bib` for the lab report) from the starter.
5. Open `main.tex` in Live view with the PDF pane open, and build once.

## Acceptance

- [ ] New vault… on an empty folder ends with `main.tex` open in Live view, its PDF beside it, and a successful build (when TeX is installed).
- [ ] Choosing Article creates an Article `main.tex`, and later Ctrl+N in that vault preselects Article.
- [ ] Cancelling the dialog leaves the folder untouched and stays on the welcome screen.
- [ ] A folder with existing `.tex` files opens directly, with no dialog.

## Comments

## Comments

Resolved on branch `onboarding` (2026-11-04).
