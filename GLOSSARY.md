# Glossary

The words endleaf uses for its own concepts. Use these terms in code, issues, specs and UI text, and avoid the synonyms listed under each.

## Files and documents

**Vault**
A folder of related `.tex` files that endleaf opens as one workspace: a course, a lab report, a paper, a thesis. Its settings live in `.vault.json` at its root.
_Avoid:_ project, workspace, folder (in UI text, except when explaining what a vault is).

**Template folder**
A folder that holds document classes (`.cls`), styles and a `starters/` subfolder. There is one global template folder (File → Template Folder) and, optionally, one per vault. Builds search both for classes.
_Avoid:_ "template" on its own for a file a new document is made from. That's a starter.

**Starter**
A file a new document is created from, shown in the New file dialog. Starters are built in, shipped by plugins, or read from `starters/` in a template folder. Examples: Article, Handout, Lab report (revtex).
_Avoid:_ template (for this meaning).

**Default starter**
The starter that New file and New vault preselect. Each vault can set one (`defaultStarter` in `.vault.json`), and an app-wide default covers vaults that don't. The app-wide default ships as Lab report (revtex).

**Getting-started vault**
A sample vault shipped with the app and copied into `Documents/endleaf/Getting started` on first use. Its document is a short revtex lab report whose prose teaches LaTeX and endleaf.

## Editing and building

**Live view**
The editor mode that renders maths, headings, references and formatting in place, and shows the LaTeX source only on the line under the cursor.

**Source view**
The editor mode that shows plain LaTeX source with syntax colouring.

**Build**
Running LaTeX on a document's root to produce its PDF. Saving a `.tex` file builds it. Build → Recompile and Ctrl+Shift+B build without saving.
_Avoid:_ compile in UI text (fine in code).

**Command**
A named action the user can run, with an id, title, category, optional default key and a condition for when it applies. Every command is in the command registry, which generates the command palette, the menus, the keymap and the keyboard shortcuts panel. See [ADR-0001](docs/adr/0001-one-command-registry.md).

**Command palette**
The Ctrl+Shift+P list of every command that can run right now.

**First-time hint**
A dismissible strip that explains one thing the first time the student meets it (Live/Source, first build, first error). There are at most three, shown one at a time. Help → Show Hints Again brings them back.

## Appearance

**Look**
The overall chrome style: Plain or Bench.

**Palette**
One of the six named colour schemes (Autumn Ember, Bookbinder's Blue, Oxblood & Gilt, Forest Floor, Plum & Amber, Slate & Ember). Each vault has its own.

**Page**
What the document sits on: the palette's own paper stock (Cream wove, Ivory laid and so on) or the Black page, which is endleaf's dark mode.

**Endpaper**
A vault's marbled sheet, generated from its palette, marbling pattern, tone and seed. It shows on the welcome screen and behind the PDF.
