# LaTeX Editor

A local, Overleaf-style LaTeX editor that works on a folder of documents (a *vault*).

## Running

Requires Node 22+ and MiKTeX (`pdflatex` on PATH).

```bash
npm install
npm run dev
```

Pass `-- --vault=<folder>` to open a vault directly. For example, `npm run dev -- --vault=fixtures/vaults/1200-latex`. Otherwise use **File → Open Vault…** (Ctrl+O). The app remembers the last vault it opened.

`npm run check` type-checks everything.

## Testing

```bash
npm test
```

Unit tests. These cover the log parser, the source scanners, and the error diagnosis for every broken document in `fixtures/errors`. Each one declares its expected result in a `% expect:` line. They run against committed logs, so no TeX is needed.

```bash
npm run test:e2e
```

End to end, and slow because it needs MiKTeX. For each broken document, this applies the first quick fix, recompiles with pdflatex, and requires a clean build.

```bash
npm run fixtures:logs
```

Regenerates `fixtures/errors/logs/`. Run it after adding or changing a broken document.

## How a vault is laid out

```
<vault>/
  .vault.json        optional; { "templates": "<vault-only .cls/.sty folder>" }
  Homework/HW3.tex   sources, organised however you like
  Images/...         referenced relative to the vault root
  pdf/Homework/HW3.pdf      finished PDFs (mirrored tree)
  .texcache/Homework/HW3/   aux, log, synctex, working PDF (hidden)
```

- **Ctrl+S** saves the file and compiles it.
- What gets compiled:
  - a `% !TEX root = ../main.tex` comment names the document to build;
  - otherwise the file itself, if it has a `\documentclass`;
  - otherwise the document compiled last, so saving an `\input`'ed piece rebuilds its parent.
- Classes are found through `TEXINPUTS`, so a vault holds no copies of them. See `spikes/README.md` for how that was tested. The folders searched, in order:
  1. the vault itself;
  2. the vault's own template folder, if `.vault.json` names one;
  3. the global template folder, one per install and shared by every vault. It defaults to `%APPDATA%\<app>\templates` and is set in `settings.json` beside it. Use **File → Template Folder** to open it or pick another.
- Opening a `.cls` file from the vault shows a banner offering to move it to the global template folder. **Not now** hides the banner for that file until the app restarts, so a new template can be worked on inside the vault first.

## Editing

| Key | Does |
|---|---|
| Ctrl+B / Ctrl+I / Ctrl+E | Toggle `\textbf`, `\textit`, `\emph` around the selection. With no selection, they insert one or remove the one the cursor is in. In math, bold and italic use `\mathbf` and `\mathit`. |
| Ctrl+M | Toggle `$…$` |
| Ctrl+Shift+M | Put the selection in display math, `\[ … \]` |
| Ctrl+Shift+A / Ctrl+Alt+A | Put the selection in `align` / `align*` |
| Ctrl+Shift+E / Ctrl+Alt+E | Put the selection in `equation` / `equation*` |
| Ctrl+Shift+F / Ctrl+Alt+F | Insert a `figure` / `figure*` with `\centering`, `\includegraphics`, `\caption` and `\label`. The image list opens for the path, and Tab moves on to the width, caption and label. |
| Enter | In a list, starts the next `\item` (or `\question`, `\part`, …). On an empty last item, it leaves the list, and a nested list continues in its parent. After an unclosed `\begin{…}`, it adds the `\end{…}`. |
| Shift+Enter | A plain new line, with no item marker |

- Renaming either end of `\begin{x}` or `\end{x}` renames the other.
- Typing `$` adds the closing `$`.
- Completion covers:
  - commands, including the class's and preamble's own, with argument placeholders (Tab moves between them);
  - environment names after `\begin{`;
  - labels inside `\ref{…}`;
  - the vault's snippets.
- Environments, sections and questions fold from the gutter.
- The **Outline** under the file tree lists the open file's sections and questions. Click one to jump there.

Per vault, in `.vault.json`:

```json
{
  "lists": { "questions": "question", "parts": "part", "choices": "choice" },
  "snippets": "snippets.txt"
}
```

- `lists` maps each list environment to its item command, and is added to `itemize`, `enumerate` and `description`.
- `snippets` names the snippet file. It defaults to `snippets.txt` at the vault root. Each snippet starts with a line `%%% name — description`, and its body runs to the next `%%%` line. The body can use `${1:placeholder}` fields. Type `\name` to insert a snippet. Saving the file reloads it.
- `fixtures/vaults/1200-latex` has examples of both.

## Layout

- `src/main/`: the Electron main process (Node).
  - `vault.ts`: file tree and file watching.
  - `compile.ts`: runs pdflatex and extracts errors.
  - `index.ts`: the window and the IPC handlers.
- `src/preload/`: the bridge that exposes `window.api` to the UI.
- `src/renderer/`: the UI in Svelte, with a CodeMirror editor and a PDF.js viewer. `lib/editing.ts` wires the LaTeX editing helpers into the editor.
- `src/shared/latexedit.ts`: the text logic behind those helpers (lists, environments, formatting, outline, snippets), unit tested.
- `src/shared/api.ts`: the types every layer shares.
- `fixtures/`: sample vaults, the shared template library and real log files for testing.
