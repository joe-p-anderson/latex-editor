<script lang="ts">
  import { onMount } from 'svelte'
  import type { CompileResult, Problem, QuickFix, TextEdit, VaultInfo } from '@shared/api'
  import FileTree from './lib/FileTree.svelte'
  import Editor from './lib/Editor.svelte'
  import PdfViewer from './lib/PdfViewer.svelte'
  import ProblemsPanel from './lib/ProblemsPanel.svelte'

  const TEXT_FILE = /\.(tex|cls|sty|bib|cfg|txt|md|json)$/i

  let vault = $state<VaultInfo | null>(null)
  let active = $state<string | null>(null)
  let dirty = $state(new Set<string>())
  let editor = $state<Editor>()
  let viewer = $state<PdfViewer>()

  // A short-lived message in the header (e.g. why a jump went nowhere).
  let note = $state<string | null>(null)
  let noteTimer: ReturnType<typeof setTimeout> | undefined
  function flash(msg: string): void {
    note = msg
    clearTimeout(noteTimer)
    noteTimer = setTimeout(() => (note = null), 3500)
  }

  let compiling = $state(false)
  let result = $state<CompileResult | null>(null)
  let pdf = $state<string | null>(null)
  let pdfVersion = $state(0)
  let compileSeq = 0

  // Editor share of the editor+PDF area, adjusted by dragging the splitter.
  let split = $state(0.5)
  let main = $state<HTMLDivElement>()

  $effect(() => {
    document.title = vault ? `${vault.name} — LaTeX Editor` : 'LaTeX Editor'
  })

  onMount(() => {
    window.api.getVault().then((v) => (vault = v))
    const offTree = window.api.onTreeChanged((tree) => vault && (vault.tree = tree))
    const offMenu = window.api.onMenuOpenVault(openVault)
    return () => (offTree(), offMenu())
  })

  async function openVault(): Promise<void> {
    const v = await window.api.openVault()
    if (!v) return
    vault = v
    active = null
    dirty = new Set()
    result = null
    pdf = null
  }

  async function openFile(rel: string): Promise<void> {
    if (!TEXT_FILE.test(rel)) return // images etc. get a preview later
    await editor?.open(rel)
    active = rel
    loadMacros(rel)
  }

  /** Gives the math preview the macros of the document `rel` belongs to. */
  async function loadMacros(rel: string): Promise<void> {
    if (!rel.endsWith('.tex')) return
    const { macros } = await window.api.mathMacros(rel).catch(() => ({ macros: {} }))
    if (rel === active) editor?.setMacros(macros)
  }

  function setDirty(rel: string, isDirty: boolean): void {
    if (isDirty === dirty.has(rel)) return
    if (isDirty) dirty.add(rel)
    else dirty.delete(rel)
    dirty = new Set(dirty)
  }

  async function save(rel: string, text: string): Promise<void> {
    await window.api.writeFile(rel, text)
    if (/\.(tex|cls|sty|cfg)$/i.test(rel)) await compile(rel)
  }

  async function compile(rel: string): Promise<void> {
    const seq = ++compileSeq
    compiling = true
    try {
      const r = await window.api.compile(rel)
      if (seq !== compileSeq) return // a newer save superseded this compile
      result = r
      editor?.setProblems(r.problems)
      if (active) loadMacros(active) // the preamble or a template may have changed
      if (r.pdf) {
        pdf = r.pdf
        pdfVersion++
      }
    } finally {
      if (seq === compileSeq) compiling = false
    }
  }

  const outsideVault = (file: string) => /^[a-zA-Z]:|^\//.test(file)

  async function jumpTo(p: Problem): Promise<void> {
    if (!p.file) return
    if (outsideVault(p.file)) {
      flash(`That's in ${p.file.split(/[\\/]/).pop()}, outside this vault`)
      return
    }
    await openFile(p.file)
    if (p.line) editor?.gotoLine(p.line)
  }

  /**
   * Applies a quick fix: each file's edits go in as one undoable change, the
   * file is saved, and the save recompiles as usual. Ctrl+Z undoes it.
   */
  async function applyFix(fix: QuickFix): Promise<void> {
    const byFile = new Map<string, TextEdit[]>()
    for (const e of fix.edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e])
    for (const [file, edits] of byFile) {
      if (outsideVault(file)) {
        flash(`Can't apply: ${file.split(/[\\/]/).pop()} is outside this vault`)
        return
      }
      await openFile(file)
      if (!editor?.applyEdits(edits)) {
        flash(`Couldn't apply "${fix.label}": the text has changed since the last compile`)
        return
      }
      editor.saveCurrent()
    }
  }

  /** Source → PDF: highlight where the cursor's line appears. */
  async function syncForward(): Promise<void> {
    if (!pdf || !active || !editor) return
    const target = await window.api.syncForward(pdf, active, editor.cursorLine())
    if (target) viewer?.show(target)
    else flash(`${active} isn't part of the PDF being shown`)
  }

  /** PDF → source: open the file and line behind a double-clicked point. */
  async function syncInverse(page: number, x: number, y: number): Promise<void> {
    if (!pdf) return
    const loc = await window.api.syncInverse(pdf, page, x, y)
    if (!loc) return
    if (/^[a-zA-Z]:|^\//.test(loc.file)) {
      flash(`That comes from ${loc.file.split(/[\\/]/).pop()}:${loc.line}, outside this vault`)
      return
    }
    await openFile(loc.file)
    editor?.gotoLine(loc.line)
  }

  function startDrag(ev: PointerEvent): void {
    const target = ev.currentTarget as HTMLElement
    target.setPointerCapture(ev.pointerId)
    const box = main!.getBoundingClientRect()
    const move = (m: PointerEvent) => (split = Math.min(0.8, Math.max(0.2, (m.clientX - box.left) / box.width)))
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true })
  }
</script>

{#if !vault}
  <div class="welcome">
    <h1>LaTeX Editor</h1>
    <p>Open a folder of LaTeX documents, such as a course's <code>latex/</code> folder.</p>
    <button onclick={openVault}>Open vault…</button>
  </div>
{:else}
  <div class="app">
    <header>
      <strong>{vault.name}</strong>
      <span class="file">{active ?? ''}</span>
      <span class="spacer"></span>
      {#if note}<span class="note">{note}</span>{/if}
      <button disabled={!pdf || !active} onclick={syncForward} title="Show the cursor's line in the PDF (Ctrl+J)">Show in PDF →</button>
      {#if compiling}
        <span class="status">Compiling…</span>
      {:else if result}
        {@const errors = result.problems.filter((p) => p.severity === 'error' && !p.hidden && !p.followOn).length}
        {@const warnings = result.problems.filter((p) => p.severity === 'warning' && !p.hidden).length}
        {#if errors}
          <span class="status err">✗ {errors} error{errors === 1 ? '' : 's'} in {result.root}</span>
        {:else}
          <span class="status ok">
            ✓ {result.root} · {(result.durationMs / 1000).toFixed(1)} s{#if warnings}<span class="warn"> · {warnings} warning{warnings === 1 ? '' : 's'}</span>{/if}
          </span>
        {/if}
      {/if}
      <button disabled={!active || compiling} onclick={() => active && compile(active)}>Recompile</button>
    </header>

    <aside>
      <FileTree nodes={vault.tree} {active} {dirty} onopen={openFile} />
    </aside>

    <div class="main" bind:this={main} style:grid-template-columns="{split}fr 6px {1 - split}fr">
      <section class="editor-pane">
        <div class="editor"><Editor bind:this={editor} onsave={save} ondirtychange={setDirty} onsyncforward={syncForward} /></div>
        {#if !active}<p class="hint">Pick a file on the left.</p>{/if}
        {#if result}<ProblemsPanel {result} onjump={jumpTo} onfix={applyFix} />{/if}
      </section>
      <div class="splitter" role="separator" aria-orientation="vertical" onpointerdown={startDrag}></div>
      <section class="pdf-pane"><PdfViewer bind:this={viewer} {pdf} version={pdfVersion} onsyncclick={syncInverse} /></section>
    </div>
  </div>
{/if}

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
  }
  .welcome h1 {
    margin: 0;
    font-weight: 600;
  }
  .welcome button {
    font-size: 15px;
    padding: 8px 20px;
  }

  .app {
    display: grid;
    grid-template-columns: 240px 1fr;
    grid-template-rows: auto 1fr;
    height: 100%;
  }
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  header .file {
    color: var(--muted);
  }
  .spacer {
    flex: 1;
  }
  .status {
    color: var(--muted);
  }
  .note {
    color: #9a6700;
    background: #fff8c5;
    border-radius: 4px;
    padding: 2px 8px;
  }
  .status.ok {
    color: var(--ok);
  }
  .status.err {
    color: var(--err);
    font-weight: 600;
  }

  aside {
    border-right: 1px solid var(--border);
    background: var(--panel);
    min-height: 0;
  }

  .main {
    display: grid;
    min-height: 0;
    min-width: 0;
  }
  .editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    position: relative;
  }
  .editor {
    flex: 1;
    min-height: 0;
  }
  .hint {
    position: absolute;
    top: 40%;
    width: 100%;
    text-align: center;
    color: var(--muted);
  }
  .status .warn {
    color: #9a6700;
  }
  .splitter {
    cursor: col-resize;
    background: var(--border);
  }
  .splitter:hover {
    background: var(--accent);
  }
  .pdf-pane {
    min-width: 0;
    min-height: 0;
  }
</style>
