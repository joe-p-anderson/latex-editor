# Bibliography card

Status: resolved

Spec: [../spec.md](../spec.md#bibliography).

## What to build

`\bibliography{a,b}` and `\printbibliography` render as a one-line card naming the `.bib` files and how many keys the project cites.

- `liveModel` emits a `bibliography` node for `\bibliography{…}` (with its file list) and for `\printbibliography[…]` (with the files from `\addbibresource{…}` in the preamble). `\bibliographystyle{…}` on the line right before or after is part of the node's range.
- The card reads e.g. `refs.bib · 14 cited`, or `refs.bib, extra.bib · 14 cited`. The count is the number of distinct cited keys across the whole project (the root and every file it includes), excluding `*` from `\nocite{*}`. It comes through a hook (as `citations()` does) so the live view doesn't parse other files itself.
- Clicking the file name opens that `.bib` in the editor (resolved relative to the root, adding `.bib` when missing). Clicking anywhere else on the card reveals the source, like other chips.
- A missing `.bib` file shows the name struck through or faint, like a missing cite.

## Acceptance

- [ ] `\bibliographystyle{plain}\n\bibliography{refs}` shows one card, `refs.bib · N cited`, with N matching the project's distinct cite keys.
- [ ] `\printbibliography` with `\addbibresource{refs.bib}` in the preamble shows the same card.
- [ ] Clicking `refs.bib` opens the file.
- [ ] A cite added in another included file updates the count.
- [ ] Unit tests cover file names from both forms and the count.

## Comments

Built and merged on branch `live-view-fixes` (2026-11-04). An included file's `\printbibliography` takes the root's `\addbibresource` files. Extras: missing `.bib` struck through, "no .bib file" placeholder, every name clickable. Not yet checked in the running app.
