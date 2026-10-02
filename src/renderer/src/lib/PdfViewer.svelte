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
    onclose,
    scope = null,
  }: {
    pdf: string | null
    version: number
    onsyncclick: (page: number, x: number, y: number) => void
    /** The control label's ×. */
    onclose: () => void
    /**
     * For a file of a multi-part paper: whether previews build just its
     * section (`label`, e.g. §III) or the whole paper, and the switch.
     */
    scope?: { label: string; section: boolean; onchange: (section: boolean) => void } | null
  } = $props()

  let scroller: HTMLDivElement
  let pages: HTMLDivElement
  let width = $state(0)
  let zoom = $state(1)
  let pageCount = $state(0)
  // A sync target asked for before the pages were drawn (e.g. the pane was just opened).
  let pending: SyncTarget | null = null
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
    pageCount = doc.numPages
    scroller.scrollTop = ratio * scroller.scrollHeight
    if (pending) {
      const target = pending
      pending = null
      show(target)
    }
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
    if (!wrap || !scale) {
      pending = target
      return
    }
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
  <!-- The controls sit outside the scrolling area, so they never move. -->
  <div class="bar">
    {#if scope}
      <span class="scope" role="group" aria-label="What to build">
        <button class:on={scope.section} onclick={() => scope.onchange(true)} title="Build just this section as you work, numbered as in the paper">{scope.label}</button>
        <button class:on={!scope.section} onclick={() => scope.onchange(false)} title="Build the whole paper{pageCount ? ` (showing ${pageCount} page${pageCount === 1 ? '' : 's'})` : ''}">Paper</button>
      </span>
    {:else if pdf}<span class="what" title={pdf}>{pdf.split(/[\\/]/).pop()}{#if pageCount} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}{/if}</span>{/if}
    <button onclick={() => (zoom = Math.max(0.4, zoom - 0.1))} title="Zoom out">−</button>
    <button onclick={() => (zoom = 1)} title="Fit the width ({Math.round(zoom * 100)}% now)">Fit</button>
    <button onclick={() => (zoom = Math.min(3, zoom + 0.1))} title="Zoom in">+</button>
    <button onclick={onclose} title="Close the PDF (Ctrl+Alt+V)" aria-label="Close the PDF">×</button>
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
    position: relative;
    /* the PDF lies on the vault's endpaper */
    background: var(--marbleimg) center / cover, var(--desk);
  }
  .scope {
    display: inline-flex;
    margin-left: -8px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--chrome-ink) 30%, transparent);
  }
  .scope button {
    border: 0;
    border-radius: 0;
    padding: 1px 10px;
    background: none;
    color: inherit;
  }
  .scope button.on {
    background: color-mix(in srgb, var(--chrome-ink) 22%, transparent);
  }
  .bar {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 3px 4px 3px 12px;
    border-radius: 16px;
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    max-width: calc(100% - 24px);
    background: var(--chrome);
    color: var(--chrome-ink);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  .bar .what {
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 4px;
  }
  .bar button {
    height: 22px;
    min-width: 24px;
    padding: 0 6px;
    border-radius: 11px;
    border-color: var(--line);
  }
  .scroller {
    flex: 1;
    overflow: auto;
    position: relative; /* so page offsetTop is measured from here */
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 52px 16px 30px;
  }
  .pages :global(.page) {
    position: relative;
    line-height: 0;
  }
  .pages :global(canvas) {
    background: var(--pdf);
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
    width: fit-content;
    margin: 56px auto 0;
    padding: 4px 12px;
    border-radius: 4px;
    color: var(--ink-soft);
    background: var(--side);
  }
</style>
