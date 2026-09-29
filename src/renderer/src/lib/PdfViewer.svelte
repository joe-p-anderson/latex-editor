<script lang="ts">
  import * as pdfjs from 'pdfjs-dist'
  import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
  import type { SyncTarget } from '@shared/api'
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  /**
   * `version` changes on every successful compile, so the same path reloads.
   * `onsyncclick` receives a double-clicked point in PDF points (page 1-based).
   */
  let {
    pdf,
    version,
    onsyncclick,
  }: { pdf: string | null; version: number; onsyncclick: (page: number, x: number, y: number) => void } = $props()

  let scroller: HTMLDivElement
  let pages: HTMLDivElement
  let width = $state(0)
  let zoom = $state(1)
  let doc: PDFDocumentProxy | null = null
  let task: PDFDocumentLoadingTask | null = null
  let renderToken = 0
  // Scroll position carries over only when the same document is recompiled.
  let loadedPath: string | null = null
  // CSS pixels per PDF point for each rendered page (1-based index).
  let pageScale: number[] = []

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
    const next: HTMLDivElement[] = []
    const scales: number[] = []
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
      // Each page gets a wrapper so SyncTeX highlights can sit on top of it.
      const wrap = document.createElement('div')
      wrap.className = 'page'
      wrap.dataset.page = String(i)
      wrap.append(canvas)
      next.push(wrap)
      scales[i] = scale
    }
    pages.replaceChildren(...next)
    pageScale = scales
    scroller.scrollTop = ratio * scroller.scrollHeight
  }

  function ondblclick(ev: MouseEvent): void {
    const wrap = (ev.target as HTMLElement).closest<HTMLDivElement>('.page')
    if (!wrap) return
    const page = Number(wrap.dataset.page)
    const box = wrap.getBoundingClientRect()
    const scale = pageScale[page]
    onsyncclick(page, (ev.clientX - box.left) / scale, (ev.clientY - box.top) / scale)
  }

  /** Scrolls `target` into view (a third of the way down) and flashes it. */
  export function show(target: SyncTarget): void {
    const wrap = pages.querySelector<HTMLDivElement>(`.page[data-page="${target.page}"]`)
    const scale = pageScale[target.page]
    if (!wrap || !scale) return
    const top = Math.min(...target.rects.map((r) => r.y))
    scroller.scrollTo({ top: wrap.offsetTop + top * scale - scroller.clientHeight / 3, behavior: 'smooth' })
    for (const r of target.rects) {
      const mark = document.createElement('div')
      mark.className = 'sync-mark'
      Object.assign(mark.style, {
        left: `${r.x * scale - 2}px`,
        top: `${r.y * scale - 2}px`,
        width: `${r.w * scale + 4}px`,
        height: `${r.h * scale + 4}px`,
      })
      wrap.append(mark)
      mark.addEventListener('animationend', () => mark.remove())
    }
  }
</script>

<div class="viewer">
  <div class="bar">
    <button onclick={() => (zoom = Math.max(0.4, zoom - 0.1))} title="Zoom out">−</button>
    <span>{Math.round(zoom * 100)}%</span>
    <button onclick={() => (zoom = Math.min(3, zoom + 0.1))} title="Zoom in">+</button>
    <button onclick={() => (zoom = 1)} title="Fit width">Fit</button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scroller" bind:this={scroller} bind:clientWidth={width} {ondblclick} title="Double-click to jump to the source">
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
    position: relative; /* so page offsetTop is measured from here */
    background: var(--pdf-bg);
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;
  }
  .pages :global(.page) {
    position: relative;
    line-height: 0;
  }
  .pages :global(canvas) {
    background: white;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .pages :global(.sync-mark) {
    position: absolute;
    pointer-events: none;
    border-radius: 3px;
    background: rgba(255, 196, 0, 0.35);
    outline: 2px solid rgba(230, 160, 0, 0.9);
    animation: sync-fade 2.5s ease-out forwards;
  }
  @keyframes sync-fade {
    0%,
    60% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .empty {
    color: #ddd;
    text-align: center;
    margin-top: 40px;
  }
</style>
