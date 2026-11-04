# Welcome screen, tooltips and empty editor

Status: ready-for-agent
Blocked by: ux-fixes 01

Spec: [../spec.md](../spec.md#welcome-screen-and-empty-states).

## What to build

- **Welcome screen** (`Welcome.svelte`): add one line under the actions: "A vault is a folder of related .tex files: a course, a lab report, a paper."
- **Tooltips** that explain app terms where they appear:
  - the page setting: "The paper your document sits on";
  - the endpaper/swatch: "This vault's marbled endpaper and colours";
  - the § in the title bar's build status: "The section of the document the error is in";
  - Layout.

  Use the wording in [GLOSSARY.md](../../../GLOSSARY.md).
- **Empty editor** (`EmptyPlate.svelte`): replace the fixed shortcut list with one generated from the registry for these commands: Command Palette, Go to File, New File, Save and Build, Find in Vault. Add two links, Keyboard Shortcuts and Getting Started, which run those commands.

## Acceptance

- [ ] The welcome screen shows the vault line.
- [ ] Each listed term has a tooltip.
- [ ] The empty editor's keys come from the registry, so changing a command's key in the registry changes the list.

## Comments
