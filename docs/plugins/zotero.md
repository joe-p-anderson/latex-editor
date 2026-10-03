# Zotero plugin

Cite references from your Zotero library. Picked items are copied into a real `.bib` file in the vault, so the document builds with Zotero closed and on other machines. Zotero is only needed to pick, add and refresh references.

Switch it on in the Plugins view (the puzzle icon). Its **Settings** there holds the setup checklist, which checks everything below live.

## Setup

1. **Zotero 7 or later.** Download it from https://www.zotero.org/download/ (the checklist has a button). The plugin finds `zotero.exe` under `%ProgramFiles%\Zotero`, `%ProgramFiles(x86)%\Zotero` or `%LocalAppData%\Zotero`.
2. **Zotero is running.** The checklist can launch it if it is installed.
3. **Local API on.** In Zotero: Edit → Settings → Advanced → tick "Allow other applications on this computer to communicate with Zotero".
4. **Better BibTeX (recommended).** It gives every reference a stable citation key, which is what makes a `.bib` file reliable. Download the `.xpi` from https://github.com/retorquere/zotero-better-bibtex/releases/latest, then in Zotero: Tools → Plugins → the gear → Install Plugin From File, and restart Zotero.
   - Suggested citation key formula (Settings → Better BibTeX): `auth.lower + shortTitle3_3 + year`.
   - **Changing the formula renames keys.** `\cite` commands that use the old keys stop resolving, and "Sync bibliography" leaves entries whose key changed alone (it tells you which).
   - Without Better BibTeX the plugin falls back to Zotero's own export. Its keys are made up on export and can change, so use Better BibTeX for anything you will keep.
5. **Zotero Connector** in your browser (optional, not detectable). It saves web pages and papers into Zotero.
6. **A `.bib` for the vault.** The checklist shows which file Zotero items go to, can create it, and, if the open document names no bibliography, adds `\bibliography{…}` (or `\addbibresource{…}` for biblatex) for you. That edit is left unsaved in the editor.
7. **Collection sync (optional, off by default).** See below.

## Using it

- **Cite picker** (Ctrl+Shift+C): type two or more letters and a "From Zotero" section lists matches that are not in the bibliography. Picking one appends its BibTeX to the `.bib`, tells you ("Added … to AngStatsBib.bib"), and cites it.
- **Quick fix**: a `\cite` of a key that has no entry, but that Zotero knows, gets "Add *key* from Zotero" in the Problems panel. It appends the entry to the `.bib` and saves.
- **Tools → Zotero → Sync bibliography from Zotero**: refreshes the entries the plugin added earlier, from Zotero's current data, and reports how many changed. Entries you wrote yourself are never touched.
- **Tools → Zotero → Cite from Zotero…**: opens Better BibTeX's own picker (the one used with "cite as you write"), then adds the chosen items to the `.bib` and cites them at the cursor.
- **Status bar "Zotero ●/○"**: reachable or not, checked now, when the window regains focus and once a minute. Clicking it while unreachable opens the Plugins view.

### Which `.bib` is used

The `.bib` named by the open document's `\bibliography{…}` or `\addbibresource{…}` (looked up next to the document, then at the vault's top). If it names several, the one set in "Bibliography file" wins when it is among them, otherwise the first. If the document names none, the "Bibliography file" setting (`references.bib`) is used and created when you first add something. The quick fix only appears when that file exists (the cite picker creates it).

### How entries are marked

Every entry the plugin writes has a comment line above it:

```bibtex
% zotero: YWZ49VGE
@article{ledbetterElasticPropertiesMetals1973,
  ...
}
```

`YWZ49VGE` is the Zotero item key. A comment line is ordinary BibTeX, shows in the file, and travels with it. Sync finds the entries to refresh by this line. Delete the line to take an entry back as your own. Adding never replaces an entry without the marker, even if the key matches, and the `file` field (a path on the machine Zotero runs on) is left out.

## Collection sync

Vault settings `syncCollection` (default off) and `collection` (default `endleaf/{vault}/{document}`, with `{vault}` the vault's name and `{document}` the file being built). After a **full** build, if the set of cited keys differs from the last sync, the plugin asks Better BibTeX to fill that collection from the build's `.aux` (`collection.scanAUX`). **BBT empties the collection first**, so use a collection that is only for this. The last synced keys are kept in `.texcache/plugins/zotero/collection.json`. It never delays a build, and does nothing without Better BibTeX.

## Settings

| Setting | Scope | Default |
|---|---|---|
| `port` | this install | 23119 |
| `bib` | vault | `references.bib` |
| `syncCollection` | vault | off |
| `collection` | vault | `endleaf/{vault}/{document}` |

## Troubleshooting

- **"Zotero ○" but Zotero is open.** Check the port (Zotero's Advanced settings, and the plugin's Zotero port setting), and that "Allow other applications…" is ticked. Another program may be using port 23119: close it, or change the port in both places.
- **Windows firewall prompt.** Zotero listens on 127.0.0.1 only. Allowing it on private networks, or declining, makes no difference to endleaf.
- **Zotero 6.** It has no local API. Update to Zotero 7 or later.
- **Citation keys changed after editing the Better BibTeX formula.** Keys already in your `.bib` and `\cite` commands keep working. New picks use the new keys, and Sync reports the entries whose key differs and leaves them. Change the keys in the document by hand, or remove the old entries and pick again.
- **"duplicates found" / a result that will not add.** Two Zotero items share a citation key; Better BibTeX refuses to export it. Fix one in Zotero (Better BibTeX → "Refresh citation key").
- **A result is missing from the cite picker.** Results already in the document's bibliography are shown above, in the document's own list. Attachments and notes are never listed.
- **Sync does nothing.** It only touches entries with a `% zotero:` line.
- **Collection sync does nothing.** It needs Better BibTeX and a full build (not a preview or a section build), and runs only when the cited keys changed.
