<script lang="ts">
  import * as pdfjs from 'pdfjs-dist'
  import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  /** `version` changes on every successful compile, so the same path reloads. */
  let { pdf, version }: { pdf: string | null; version: number } = $props()

  let scroller: HTMLDivElement
  let pages: HTMLDivElement
  let width = $state(0)
  let zoom = $state(1)
  let doc: PDFDocumentProxy | null = null
  let task: PDFDocumentLoadingTask | null = null
  let renderToken = 0
  // Scroll position carries over only when the same document is recompiled.
  let loadedPath: string | null = null

  $effect(() => {
    void version
    if (pdf) load(pdf)
  })

  // Re-render to fit when the pane is resized or zoomed (debounced, since a
  // drag produces a stream of widths).
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    void width
    void zoom
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => render(), 120)
  })

  async function load(path: string): Promise<void> {
    const data = await window.api.readPdf(path)
    const nextTask = pdfjs.getDocument({ data })
    const next = await nextTask.promise
    const prevTask = task
    task = nextTask
    doc = next
    const samePdf = path === loadedPath
    loadedPath = path
    await render(samePdf)
    prevTask?.destroy()
  }

  /**
   * Draws every page into a detached container and swaps it in at the end,
   * so a recompile never flashes blank. Scroll position is kept as a fraction
   * of the document, which survives small changes in page count.
   */
  async function render(keepScroll = true): Promise<void> {
    const token = ++renderToken
    if (!doc || width === 0) return
    const ratio = keepScroll ? scroller.scrollTop / (scroller.scrollHeight || 1) : 0
    const cssWidth = Math.max(200, (width - 32) * zoom)
    const dpr = window.devicePixelRatio || 1
    const next: HTMLCanvasElement[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const scale = cssWidth / page.getViewport({ scale: 1 }).width
      const viewport = page.getViewport({ scale: scale * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${cssWidth}px`
      await page.render({ canvas, viewport }).promise
      if (token !== renderToken) return // a newer render started; drop this one
      next.push(canvas)
    }
    pages.replaceChildren(...next)
    scroller.scrollTop = ratio * scroller.scrollHeight
  }
</script>

<div class="viewer">
  <div class="bar">
    <button onclick={() => (zoom = Math.max(0.4, zoom - 0.1))} title="Zoom out">−</button>
    <span>{Math.round(zoom * 100)}%</span>
    <button onclick={() => (zoom = Math.min(3, zoom + 0.1))} title="Zoom in">+</button>
    <button onclick={() => (zoom = 1)} title="Fit width">Fit</button>
  </div>
  <div class="scroller" bind:this={scroller} bind:clientWidth={width}>
    {#if !pdf}<p class="empty">Save a .tex file (Ctrl+S) to compile it.</p>{/if}
    <div class="pages" bind:this={pages}></div>
  </div>
</div>

<style>
  .viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .bar {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .bar span {
    min-width: 42px;
    text-align: center;
    color: var(--muted);
  }
  .scroller {
    flex: 1;
    overflow: auto;
    background: var(--pdf-bg);
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;
  }
  .pages :global(canvas) {
    background: white;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .empty {
    color: #ddd;
    text-align: center;
    margin-top: 40px;
  }
</style>
