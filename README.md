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
  .vault.json        { "templates": "<path to shared .cls/.sty library>" }
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
- Classes are found through `TEXINPUTS` pointing at the shared template library, so a vault holds no copies of them. See `spikes/README.md` for how that was tested.

## Layout

- `src/main/`: the Electron main process (Node).
  - `vault.ts`: file tree and file watching.
  - `compile.ts`: runs pdflatex and extracts errors.
  - `index.ts`: the window and the IPC handlers.
- `src/preload/`: the bridge that exposes `window.api` to the UI.
- `src/renderer/`: the UI in Svelte, with a CodeMirror editor and a PDF.js viewer.
- `src/shared/api.ts`: the types every layer shares.
- `fixtures/`: sample vaults, the shared template library and real log files for testing.
