<script lang="ts">
  import { onMount } from 'svelte'
  import type { CompileResult, LogMessage, VaultInfo } from '@shared/api'
  import FileTree from './lib/FileTree.svelte'
  import Editor from './lib/Editor.svelte'
  import PdfViewer from './lib/PdfViewer.svelte'

  const TEXT_FILE = /\.(tex|cls|sty|bib|cfg|txt|md|json)$/i

  let vault = $state<VaultInfo | null>(null)
  let active = $state<string | null>(null)
  let dirty = $state(new Set<string>())
  let editor = $state<Editor>()

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
      if (r.pdf) {
        pdf = r.pdf
        pdfVersion++
      }
    } finally {
      if (seq === compileSeq) compiling = false
    }
  }

  async function jumpTo(e: LogMessage): Promise<void> {
    if (!e.file || /^[a-zA-Z]:|^\//.test(e.file)) return // outside the vault (e.g. a template)
    await openFile(e.file)
    if (e.line) editor?.gotoLine(e.line)
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
      {#if compiling}
        <span class="status">Compiling…</span>
      {:else if result}
        {#if result.ok}
          <span class="status ok">✓ {result.root} · {result.passes} pass{result.passes === 1 ? '' : 'es'} · {(result.durationMs / 1000).toFixed(1)} s</span>
        {:else}
          <span class="status err">✗ {result.errors.length} error{result.errors.length === 1 ? '' : 's'} in {result.root}</span>
        {/if}
      {/if}
      <button disabled={!active || compiling} onclick={() => active && compile(active)}>Recompile</button>
    </header>

    <aside>
      <FileTree nodes={vault.tree} {active} {dirty} onopen={openFile} />
    </aside>

    <div class="main" bind:this={main} style:grid-template-columns="{split}fr 6px {1 - split}fr">
      <section class="editor-pane">
        <div class="editor"><Editor bind:this={editor} onsave={save} ondirtychange={setDirty} /></div>
        {#if !active}<p class="hint">Pick a file on the left.</p>{/if}
        {#if result && result.errors.length > 0}
          <ul class="errors">
            {#each result.errors as e, i (i)}
              <li><button onclick={() => jumpTo(e)}><span class="loc">{e.file}{e.line ? `:${e.line}` : ''}</span> {e.message}</button></li>
            {/each}
          </ul>
        {/if}
      </section>
      <div class="splitter" role="separator" aria-orientation="vertical" onpointerdown={startDrag}></div>
      <section class="pdf-pane"><PdfViewer {pdf} version={pdfVersion} /></section>
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
  .errors {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 30%;
    overflow: auto;
    border-top: 2px solid var(--err);
    background: #fff5f5;
  }
  .errors button {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    border-radius: 0;
    background: none;
    padding: 5px 10px;
    font-family: Consolas, monospace;
    font-size: 12px;
  }
  .errors button:hover {
    background: #ffe3e3;
  }
  .loc {
    color: var(--err);
    font-weight: 600;
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
