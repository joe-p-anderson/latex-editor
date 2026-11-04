# endleaf UI/UX review

A scored review of the core editor's UI/UX, done on 3 November 2026 against build `89981ce` on main.

- **Who it's rated for:** a junior physics student who is just learning LaTeX and already knows VS Code. Findings are read through two lenses: new to LaTeX, and used to VS Code.
- **Scope:** the core editor in the Plain look, all six palettes on both their paper page and the Black page. The problem bank and other plugins are out of scope. The Bench look wasn't reviewed.
- **Published copy, with screenshots:** <https://claude.ai/artifact/Evx5HCZekfFQD9faUeVuaR> (private to the owner's account).
- **Measurement script:** [`ux-review-measure.js`](ux-review-measure.js). Method and limits are at the end.

**Weighted score: 3.4 / 5.**

## Summary

The core loop is strong. Saving builds the PDF, the build status sits in the title bar, and errors are explained in plain English with a link to the right line. Autocomplete fills in `\frac{…}{…}` with placeholders. Live view renders the maths, so a student sees the result of what they type. Body text contrast is 11–15:1 in every configuration.

Two things hold the score down. First, a VS Code user can't find things the way they expect. Ctrl+Shift+P lists only two Zotero commands. Ctrl+Shift+F inserts a figure environment, and Ctrl+Shift+B hides the sidebar. Second, the secondary text is too faint. Comments and line numbers fail contrast in all 12 configurations. On the paper pages, the title bar and status bar text drops to about 2.2:1. Oxblood and Plum on paper also drop every LaTeX command below 3:1.

## Scorecard

Scale: 1 blocks or misleads, 2 frequent friction, 3 acceptable, 4 good with minor issues, 5 best in class. Half points are allowed.

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Findability | 15% | 2.5 | The command palette has no core commands. Build has no shortcut and appears only under Build → Recompile. Save isn't in the File menu. There is no Help menu and no shortcut list. Appearance is split between the gear and the vault swatch. Quick open, panel, PDF and SyncTeX all match VS Code and LaTeX Workshop. *VS Code lens:* Ctrl+Shift+P, Ctrl+Shift+F, Ctrl+Shift+B and Ctrl+, all fail or do something unexpected. |
| Colour & contrast | 12% | 2.5 | Body text reaches 11–15:1, but comments (1.8–2.4:1) and line numbers (1.9–2.6:1) fail everywhere. On paper pages, secondary chrome text is 2.2–2.6:1. On Black pages, the warning-count badge is about 1.4:1. LaTeX commands on Oxblood and Plum paper are 2.8–3.0:1. Black pages, the default, do much better than paper. |
| Typography & font size | 12% | 3.5 | Live body text is 19px Crimson Pro, adjustable from 17 to 21px. Source is 14px monospace and scales with the same setting. Chrome is 12–14px, in line with VS Code. Against that, the activity bar's "TOOLS" label is 8.5px, and Live view justifies text and puts a dot in every space. |
| Readability of source | 8% | 3.5 | Commands, environments, maths and labels share one accent colour, with braces dimmed, so `\begin{align}` and `\alpha` look the same. Wrapped lines have no hanging indent. Live view renders equations, numbering and citations. *LaTeX lens:* Live view is a real help, but its dots and justified text make prose harder to scan. |
| Feedback & status | 8% | 4.0 | The title bar shows "Built · 9.8 s", "1 error in §IV" or "Previewing…", with a red ribbon on errors. The Problems panel opens by itself, the PDF keeps the last good build, and the status bar counts warnings. This status text is about 2.2:1 on paper pages. |
| Error handling & recovery | 8% | 4.5 | Errors read like "\undefinedcmd isn't defined by LaTeX, this document, or any class or package it loads (10,301 commands checked)". Each links to `file.tex:2`, with a gutter dot and squiggle, and TeX's raw output is folded underneath. Deletes go to the trash with Undo. One exception: a vault on a path containing `~` gave three vague "LaTeX stopped" errors pointing at `main.tex`. |
| Efficiency | 7% | 4.0 | Saving builds. There are shortcuts for bold, italic, emphasis, inline and display maths, equation, align and figure. Autocomplete fills placeholders. Back/forward, tab cycling and quick open work. None of the LaTeX shortcuts appear in any menu or the palette. |
| Learnability & first run | 7% | 2.5 | The welcome screen offers "Open a folder…" and "New vault…" but never says what a vault is. A new vault is an empty folder with a random palette. The New file dialog is good, with Article, Handout and Section templates. The empty editor lists five shortcuts. There's no help, no sample document, and no explanation of Live versus Source. *LaTeX lens:* the student has to know to choose "Article" to get a compilable document. |
| Visual hierarchy & layout | 6% | 3.5 | A familiar workbench, and the active file and tab are clear. The fully saturated marbling behind the PDF pages competes with the document. The title bar contents moved down about 6px after the first build. |
| Consistency | 6% | 3.5 | Chrome mixes serif and sans in one row: the panel tab "Log" is serif while "Errors" is sans. The Live/Source toggle appears in both the title bar and the status bar. App-specific terms (vault, paper, endpaper, §, Layout) appear without explanation. |
| Accessibility beyond colour | 6% | 3.5 | All 57 visible buttons have an accessible name. Focus rings are visible. The file tree uses `role=treeitem` with arrow keys, F2 and Delete. Zoom is under View. Reduced-motion handling exists only in the title bar. Screen reader output wasn't tested. |
| Aesthetic coherence | 5% | 4.5 | A distinctive, finished look. The bookbinding idea carries through the palettes, endpapers, logo and type without getting in the way of the editor. |

## Fix first

1. **Put every core command in Ctrl+Shift+P, with its shortcut.** Build, toggle PDF, Live/Source, new file, search, appearance, text size and the LaTeX inserts. This is the first place a VS Code user looks, and it would also teach the shortcuts.
2. **Raise the faint tokens to at least 4.5:1, or 3:1 for line numbers and icons.** Comments, line numbers, paper-page secondary chrome (title bar, status bar, inactive Live/Source, tab ×), the warning badge on Black, and the command colour on Oxblood and Plum paper.
3. **Give Ctrl+Shift+F and Ctrl+Shift+B their VS Code meanings.** Make them search the vault and build. Move "insert figure" to another chord, and keep Ctrl+Shift+H for search as well.
4. **Make building and the shortcuts visible.** Give Recompile a shortcut and list it. Add Save to the File menu, noting that it also builds. Add an Insert or Format menu for the LaTeX shortcuts, and a Help menu with a shortcut sheet.
5. **Make the first run start somewhere.** Add one line on the welcome screen: "A vault is a folder of related .tex files." Have New vault create `main.tex` from the Article template and open it beside its PDF.
6. **Make the space dots in Live view optional, and use ragged-right text.** Justified prose with a dot in every gap is the main cost to reading speed in Live view.
7. **Put all appearance settings in one panel.** Page and type are under the gear, but palette and marbling are under the vault swatch.
8. **Fix the edge cases.** A vault path containing `~` breaks error reporting. It's also worth checking what a student sees when no TeX distribution is installed (not tested here).

## Where things are versus where a student looks

Run in the app or traced through its menus and key handlers. "First try" is what a VS Code user new to LaTeX would most likely do.

| Task | First try | What happens | Result |
|---|---|---|---|
| Find any command | Ctrl+Shift+P | Two Zotero commands. Searching "compile" or "pdf" gives "No commands match". | Fails |
| Search every file | Ctrl+Shift+F | Inserts a `figure` environment at the cursor. Vault search is Ctrl+Shift+H or the magnifier icon. | Fails |
| Build the PDF | Ctrl+Shift+B | Hides the sidebar. Ctrl+S saves and builds, and the empty PDF pane says so. Build → Recompile has no shortcut. | Partly |
| Start a document | Welcome → New vault… | A folder picker, then an empty vault. Ctrl+N then offers good templates. "Vault" is never explained. | Partly |
| Bigger text | Ctrl+, | Nothing happens. Text size is under the gear, and View → Zoom scales the whole window. | Partly |
| Change colours | Gear | Page and type are here. Palette and marbling are under a separate swatch button. | Partly |
| Bold a word | Ctrl+B | Wraps it in `\textbf`, or `\boldsymbol` in maths. Suits LaTeX, but isn't listed anywhere, and VS Code users expect it to toggle the sidebar. | Hidden |
| See the PDF | Book icon or Ctrl+Alt+V | Opens the PDF on the right. The shortcut matches LaTeX Workshop. | Works |
| Fix an error | Problems panel | Opens by itself, with a plain-English cause, a `file:line` link, a gutter dot and the raw TeX output folded underneath. | Works |
| Write a fraction | Type `\fr` | Suggests `\frac{…}{…}`, `\dfrac` and `\tfrac`, with tab stops. The Σ panel lists symbols. | Works |
| Rename or delete a file | F2, right-click, Delete | All three work. Deleted files go to the trash with an Undo. | Works |
| Jump from source to PDF | Ctrl+Alt+J | SyncTeX forward search, the same as LaTeX Workshop. Also under Build. | Works |

## Contrast across the 12 configurations

WCAG contrast ratio of each kind of text against its actual background. The lowest value is shown, except body text and line numbers, which show the median. Black is the default page. Text passes at 4.5:1 or more; 3–4.5:1 is enough only for large text and UI; below 3:1 fails.

| Palette | Page | Body | LaTeX commands | Comments | Line numbers | Title & status text | Sidebar labels | Tab × | Panel text | Count badge |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Autumn Ember | Cream wove | 14.1 | 5.6 | **1.8** | **1.9** | **2.2** | 3.3 | **2.6** | 3.3 | 3.1 |
| Autumn Ember | Black | 10.9 | 5.7 | **2.3** | **2.6** | 6.6 | 6.2 | 6.2 | 5.1 | **1.4** |
| Bookbinder's Blue | Bright white | 15.0 | 7.8 | **1.8** | **2.0** | **2.4** | 3.5 | **2.8** | 3.5 | 3.2 |
| Bookbinder's Blue | Black | 11.8 | 9.4 | **2.4** | **2.6** | 6.6 | 6.3 | 6.1 | 5.4 | **1.5** |
| Oxblood & Gilt | Ivory laid | 12.9 | **2.8** | **1.8** | **1.9** | **2.2** | 3.2 | **2.5** | **2.8** | **2.8** |
| Oxblood & Gilt | Black | 12.7 | 8.4 | **2.4** | **2.6** | 6.7 | 6.4 | 6.3 | 5.6 | **1.5** |
| Forest Floor | Natural | 14.3 | 5.6 | **1.8** | **1.9** | **2.5** | 3.4 | **2.8** | 3.4 | 3.1 |
| Forest Floor | Black | 11.2 | 5.7 | **2.3** | **2.6** | 6.4 | 6.1 | 6.0 | 5.2 | **1.4** |
| Plum & Amber | Soft white | 13.1 | **3.0** | **1.8** | **1.9** | **2.3** | 3.3 | **2.6** | **3.0** | **2.8** |
| Plum & Amber | Black | 12.4 | 7.4 | **2.4** | **2.6** | 6.6 | 6.4 | 6.3 | 5.6 | **1.4** |
| Slate & Ember | Cool white | 14.4 | 5.2 | **1.8** | **1.9** | **2.6** | 3.4 | **2.9** | 3.4 | 3.1 |
| Slate & Ember | Black | 11.4 | 4.4 | **2.3** | **2.6** | 6.3 | 6.1 | 6.0 | 4.4 | **1.4** |

Values below 3:1 are in bold. The paper grain texture was left out, so real contrast on paper pages is slightly lower than shown. "Title & status text" includes "1 error in §IV", "Previewing…", "Built · 9.8 s" and the inactive Live/Source button. "Count badge" is the error and warning count in the Problems panel tabs.

## Type sizes

CSS pixels, at a 1502×920 window and 125% Windows scaling (14px renders as 17.5 device pixels), with Text size at the default 19px.

| Where | Size | Face | Verdict |
|---|---:|---|---|
| Live view body | 19px | Crimson Pro | Good. Headings are 29.5px. Adjustable from 17 to 21px. |
| Source view | 14px | Consolas | Good. Same as VS Code's default, and follows the setting (15.5px at 21). |
| File tree, tabs | 13–14px | Source Sans 3 | Good. |
| Status bar, title bar status | 12px | Source Sans 3 | The size is fine; the problem is contrast on paper pages. |
| Line numbers | 12px | Crimson Pro italic | Weak: small, italic and faint together. |
| Sidebar and panel headers, badges | 11px | Sans, uppercase, letter-spaced | Small, but acceptable for labels. |
| Activity bar "TOOLS" label | 8.5px | Source Sans 3 | Too small. |

## What already works

For someone new to LaTeX:

- Error messages explain the cause in plain words and link to the line.
- Live view renders equations, section numbers and citations as you type, and previews maths even before it's closed.
- The New file dialog has templates with a preview of what each inserts.
- The empty PDF pane says how to build: "Save a .tex file (Ctrl+S) to compile it."
- Autocomplete knows the document's own commands, with snippet placeholders.

For a VS Code user:

- The layout is the one they know: activity bar, tree, tabs, panel and status bar.
- Ctrl+P, Ctrl+J, Ctrl+W, Ctrl+Tab, Alt+←/→, F2 and Delete all behave as expected.
- Ctrl+Alt+V and Ctrl+Alt+J match LaTeX Workshop.
- Build on save matches LaTeX Workshop's default.
- Every icon button has a tooltip and an accessible name.

## Method and limits

- The app ran from source (`electron-vite dev`) with an isolated `--user-data-dir` and a scratch copy of `fixtures/vaults/AngStatsRevTex`. It was driven over the Chrome DevTools Protocol.
- Contrast and sizes came from [`ux-review-measure.js`](ux-review-measure.js), run on every visible text node in both Source and Live view, with the PDF and Problems panel open. Palette and page were switched through the app's own panels for each of the 12 configurations.
- Menus were read from `src/main/index.ts` and keyboard shortcuts from `App.svelte`, `Editor.svelte` and `editing.ts`, because native menus don't show up in screenshots.
- Not tested: a screen reader, a machine with no TeX installed, the Bench look, and plugins other than their presence in the command palette.
- The `~`-path failure came from the test environment's short path name (`C:\Users\JANDER~1\…`). A real user could hit it with a vault under a short-named folder. On the long path, the same mistake was reported correctly.
- The screenshots are only in the published copy, to keep about 5MB of images out of the repo.
