# Live view fixes: code, environments, bibliography, vault switcher

Four problems noticed in use, settled in a grilling session on 2026-11-04.

1. Inline `\verb` contents are scanned by the live view, so a `\section` or `\input` inside them turns into a heading or an input card.
2. Begin/end fence tags only appear for `abstract`, `subequations`, `document` and the list environments. `acknowledgments`, exam-class `questions` and most others get nothing.
3. The bibliography isn't rendered at all.
4. On the welcome screen, hovering a vault changes the marble and the logo, but the bookplate keeps the current app theme.

## Goals

- Code is never scanned for live constructs, and looks like code.
- Every environment's `\begin` and `\end` is visible as a tag in the live view.
- Exam-class lists work in every vault without configuration.
- A bibliography reads as a bibliography, and citations to it show their number.
- The bookplate previews the hovered vault's colours.

## Non-goals

- `\texttt{…}`. It is formatting, its contents can hold real commands, and it stays scanned.
- Syntax highlighting inside code.
- Indenting environment bodies. Only lists indent.
- Showing environment arguments in fence tags (`\begin{theorem}[Pythagoras]` shows `theorem`).
- Formatting reference entries from the `.bib` in the live view. The PDF does that.

## Design

### Inline code

These commands are code: `\verb`, `\verb*`, `\lstinline` (with any delimiter, or `{…}`, and an optional `[…]` before it), and `\mintinline{lang}{…}` (or with a delimiter instead of the second group).

- **Never scanned.** A shared helper in `src/shared/` finds the inline code spans in a source text. `liveModel` skips them the way it skips math regions. `envTokens` and `findMathRegions` skip them too, so `\verb|\begin{x}|` opens no environment and `\verb|$|` starts no math. Anything else that tokenises source (`pairs`, spellcheck words, `diagnose`) should use the same helper where it already skips verbatim environments.
- **Rendered as code.** The model emits a `code` node with the command span and the contents span. Outside the cursor, the command and delimiters are hidden and the contents show in `var(--f-mono)`, coloured `var(--detail)` (the editor's command colour), with no background. With the cursor in or touching it, the raw source shows, like other live constructs.
- An unterminated `\verb` (no closing delimiter on the line) is left as source.

### Code blocks

`verbatim`, `Verbatim`, `lstlisting`, `minted` and `comment` (with or without `*`) already stay unscanned (`VERBATIM` in `livemodel.ts`). Now:

- The body is styled like inline code: `var(--f-mono)` in `var(--detail)`, no shading.
- `\begin` and `\end` get fence tags like any other environment (below), showing the environment name only. `minted`'s `{lang}` and `lstlisting`'s `[…]` are hidden with the `\begin` when the tag shows.
- `comment` is code too. Its body is also styled as code.

### Fence tags on every environment

Every `\begin{…}`/`\end{…}` gets a fence tag, except the environments that have their own widget: display math, figures, tables and tabulars. That includes environments the live view doesn't know and ones the user defines.

- The tag shows the environment name only, and `end name` at the end, as `FenceWidget` does today.
- Arguments after `\begin{name}` (optional or mandatory) are hidden with it while the tag shows, and come back when the cursor is on the line.
- Bodies are not indented. Lists keep their indentation and markers.
- `TAGGED` in `livemodel.ts` goes away in favour of "any environment without its own widget". `abstract` and `subequations` keep their extra behaviour.
- An `\end` with no matching `\begin` gets no tag.

### Exam-class lists by default

`DEFAULT_LISTS` in `latexedit.ts` gains the exam-class lists, for every vault:

| Environment | Item command |
|---|---|
| `questions` | `question` |
| `parts` | `part` |
| `subparts` | `subpart` |
| `subsubparts` | `subsubpart` |
| `choices`, `oneparchoices`, `checkboxes`, `oneparcheckboxes` | `choice` (and `CorrectChoice`) |

A vault's `.vault.json` can still add more lists, and its entries win over the defaults. The defaults also drive Enter-in-a-list, folding and the outline, which is intended.

### Bibliography

**`thebibliography`** is rendered as a list:

- `\begin{thebibliography}{99}` gets a fence tag (`thebibliography`), with the `{99}` hidden.
- Each `\bibitem[label]{key}` gets a hanging marker: `[n]` in order, or `[label]` when the optional label is given, followed by the key as a chip. The entry text stays prose.
- `\cite{key}` chips for those keys show `[n]` (or the label), even before a compile. When the compiled `.aux` gives a label, that wins, as today.

**`\bibliography{a,b}` and `\printbibliography`** each become a one-line card, e.g. `refs.bib · 14 cited`:

- The file names come from the `\bibliography` argument, or from `\addbibresource` in the preamble for `\printbibliography`.
- The count is the number of distinct keys cited across the whole project (every file the root includes), not just the open file.
- Clicking the card opens the `.bib` file (the first one when there are several). The card reveals its source on click like other chips, so the click target is the file name.
- `\bibliographystyle{…}` is hidden into the card when it is on the line before or after.

### Vault switcher bookplate

On the welcome screen, the bookplate (paper, ink, ruled border, and the accent on the primary button) takes the hovered vault's palette:

- The plate's tokens are computed with `appearanceTokens(app, hoveredVault.appearance, paletteTheme(...))`, using the user's current app settings (look, page). This is what the app applies when it opens that vault. They are set as custom properties on the `.plate` element, so the rest of the page is unaffected.
- When nothing is hovered, the plate shows the vault that the marble shows (`shown`), i.e. the most recent vault.
- The change waits the same 140 ms as the marble, then the colours cross-fade over about 200 ms.

## Testing

Unit tests in `tests/` against `liveModel` and the shared helpers cover: inline code spans (each command and delimiter form, unterminated `\verb`, `\verb` holding `\begin`, `$` and `\section`); fence nodes for unknown environments and none for widget environments; exam defaults; `thebibliography` items and cite numbering; the bibliography card's file names and cited count. The bookplate is checked in the running app.

## Tickets

1. [Inline code spans](issues/01-inline-code.md)
2. [Code block styling](issues/02-code-blocks.md)
3. [Fence tags on every environment](issues/03-fences-everywhere.md)
4. [Exam-class lists by default](issues/04-exam-lists.md)
5. [thebibliography as a list](issues/05-thebibliography.md)
6. [Bibliography card](issues/06-bibliography-card.md)
7. [Bookplate takes the hovered palette](issues/07-bookplate-palette.md)
