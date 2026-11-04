# UX fixes: findability, contrast and Live view

Fixes for the core editor from [the UI/UX review](../../docs/design/UX-REVIEW.md), which scored it 3.4 / 5. The review is rated for a junior physics student who is learning LaTeX and already knows VS Code. Help and first-run work is in a separate spec, [onboarding](../onboarding/spec.md).

## Goals

- A VS Code user finds every core command where they first look: Ctrl+Shift+P, the menus, and VS Code's usual keys.
- Every text token is readable in every palette, page and look, and a test keeps it that way.
- Prose in Live view reads easily.

## Non-goals

- User-rebindable keys. The registry leaves room for them later.
- The short-path (`~`) error-reporting bug, which is tracked in [short-path-errors](../short-path-errors/issues/01-short-path-vault-errors.md).
- The marbling behind the PDF, which stays at full strength as part of the look.
- The duplicate Live/Source toggle. Both the title bar and status bar controls stay.
- App-wide reduced-motion handling.
- Plugins, apart from moving their commands into the registry.

## Design

### Command registry

The renderer holds one registry of commands ([ADR-0001](../../docs/adr/0001-one-command-registry.md)). Each command has:

| Field | Meaning |
|---|---|
| `id` | Stable id, e.g. `build.recompile`, `insert.align`. |
| `title` | What the palette and menus show, e.g. "Insert Align Environment". |
| `category` | File, Edit, Insert, View, Build, Tools or Help. The palette shows it as a prefix ("Build: Recompile"). |
| `key` | Optional default key, in CodeMirror notation (`Mod-Shift-b`). |
| `when` | Optional condition: a vault is open, a `.tex` file is active, the editor has focus, the cursor is in maths. |
| `run` | The action. |

Plugin commands register into the same registry under the Tools category, with the plugin's name as a group.

The registry generates:

- **The command palette.** Shows every command whose `when` holds, with its key on the right. Commands that can't run now are hidden.
- **The native menus.** The renderer sends the menu tree (titles, ids, accelerators, enabled state) to the main process, the way `setPluginMenu` does today. Native-only items such as Quit, clipboard roles and Template Folder stay in `src/main/index.ts`.
- **The keymap.** App-wide keys and the editor's LaTeX keys are both bound from the registry.
- **The Keyboard Shortcuts panel** (onboarding spec).

### Keymap

These keys change, and every other existing key stays as it is.

| Key | Now | After |
|---|---|---|
| Ctrl+Shift+F | Insert `figure` | Find in Vault (VS Code's meaning). Ctrl+Shift+H stays as an alias. |
| Ctrl+Shift+B | Toggle sidebar | Build: Recompile (VS Code's "run build task"). |
| Ctrl+Alt+F | Insert `figure*` | Insert `figure`. `figure*` has no key and stays in the palette and the Insert menu. |
| Ctrl+Alt+B | — | Toggle sidebar. |
| Ctrl+, | — | Open the Appearance panel. |
| Ctrl+B | Bold | Unchanged. Bold is what every LaTeX editor uses it for. |

### Menus

The menu bar becomes **File · Edit · Insert · View · Build · Tools · Help**, built from the registry.

- **File** gains "Save" with Ctrl+S. Its menu label is "Save and Build" for `.tex` files.
- **Insert** is new. It holds a Format submenu (bold, italic, emphasis), inline maths, display maths, equation, equation\*, align, align\*, figure, figure\*, table, image, cite and symbols. These move out of Edit.
- **Build** gets Recompile on Ctrl+Shift+B.
- **Help** is new. Its contents are in the onboarding spec.

### Contrast

Targets, measured against each token's real background:

- **4.5:1 or more** for all text: body, comments, LaTeX commands, title and status text (including the inactive Live/Source button), sidebar labels, panel text, and the Problems panel count badge.
- **3:1 or more** for line numbers, icons and the tab ×.

These hold for all six palettes × two pages × both looks (Plain and Bench). A unit test computes the ratios from the token functions (`plainTokens` in `src/shared/appearance.ts`, the editor and Live themes, and Bench's equivalents), so a change that breaks a target fails CI. `docs/design/ux-review-measure.js` stays as the in-app check.

The review's worst cases, which the fixes must clear:

- comments at 1.8–2.4:1 and line numbers at 1.9–2.6:1, everywhere;
- secondary chrome text on paper pages at 2.2–2.6:1;
- the count badge on Black at about 1.4:1;
- LaTeX commands on Oxblood and Plum paper at 2.8–3.0:1.

### Syntax roles

Source view currently uses one accent for every LaTeX construct, so `\begin{align}` and `\alpha` look alike. Split it into three roles, each with its own colour per palette and page:

1. **Commands**: `\frac`, `\section`, `\alpha`.
2. **Structure**: environment names in `\begin{…}`/`\end{…}`, and label and reference keys.
3. **Maths content**: the inside of `$…$`, `\[…\]` and maths environments.

Braces stay dimmed. Each role must meet 4.5:1.

### Live view text

- Prose is ragged-right everywhere. Justification is removed (`textAlign: 'justify'` in `src/renderer/src/lib/live/theme.ts`).
- The faint dot in each space (`src/renderer/src/lib/live/live.ts:378`) is off by default. A setting, "Show spaces in Live view", turns it on.

### One Appearance panel

Page and type are under the gear today, and palette and marbling are under the vault swatch. Merge them into one Appearance panel with sections for Look, Page, Type, Palette and Endpaper. The gear, Ctrl+, and View → Appearance open it. The vault swatch opens the same panel scrolled to Palette.

### Chrome polish

- The activity bar's "TOOLS" label goes from 8.5px to 11px.
- Chrome text is all sans. Today the panel tab "Log" is serif while "Errors" is sans.
- Line numbers become upright (not italic), in addition to the contrast fix.
- The title bar contents stop moving down about 6px after the first build.

## Tickets

1. [Command registry and palette](issues/01-command-registry.md)
2. [Keymap and menus from the registry](issues/02-keymap-and-menus.md)
3. [Contrast targets and test](issues/03-contrast-tokens.md)
4. [Three syntax roles](issues/04-syntax-roles.md)
5. [Live view text](issues/05-live-view-text.md)
6. [One Appearance panel](issues/06-appearance-panel.md)
7. [Chrome polish](issues/07-chrome-polish.md)
