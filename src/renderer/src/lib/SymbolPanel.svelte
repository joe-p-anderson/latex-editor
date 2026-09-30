<script lang="ts" module>
  export interface LibrarySymbol {
    id: string
    command: string
    /** The package that provides it; null for base LaTeX. */
    package: string | null
    /** A font encoding it needs, e.g. T1. */
    fontenc: string | null
    mode: 'math' | 'text' | 'both'
    svg: string
  }

  export interface SymbolActions {
    /** Puts the symbol in the document at the cursor. */
    insert(s: LibrarySymbol): void
    /** Adds the \usepackage (and fontenc) it needs to the document's preamble. */
    addPackage(s: LibrarySymbol): void
    /** Whether the open document already has what the symbol needs. */
    hasPackage(s: LibrarySymbol): Promise<boolean>
    /** What the open document loads (null: no document), to rank the matches. */
    loadedPackages(): Promise<{ packages: Set<string>; encodings: Set<string> } | null>
    /** A short message in the header. */
    note(message: string): void
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import type { Stroke } from '@shared/detexify'
  import type { TouchpadEvent } from '@shared/api'
  import type { WorkerRequest, WorkerResponse } from './detexify.worker'

  /**
   * The symbol library, with Detexify's handwriting recognition: draw a
   * symbol and the list shows what it probably is. Click a symbol to copy
   * its command, double-click to put it in the document, right-click for
   * more.
   */
  let {
    actions,
    active,
    docKey,
  }: {
    actions: SymbolActions
    active: boolean
    /** Changes with the open document (another file, a save, a build), to recheck what it loads. */
    docKey: string
  } = $props()

  let symbols = $state.raw<LibrarySymbol[]>([])
  let byId = new Map<string, LibrarySymbol>()
  let loading = $state(true)
  let query = $state('')
  let pkg = $state('')
  let recent = $state<string[]>(loadRecent())
  let matches = $state<string[] | null>(null)
  let recognising = $state(false)

  // The library loads the first time the panel is shown.
  $effect(() => {
    if (active && !symbols.length) loadLibrary()
  })

  async function loadLibrary(): Promise<void> {
    const mod = await import('../assets/detexify/symbols.json')
    const list = mod.default as LibrarySymbol[]
    byId = new Map(list.map((s) => [s.id, s]))
    symbols = list
    loading = false
  }

  const imageUrl = (s: LibrarySymbol) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`
  const packages = $derived([...new Set(symbols.map((s) => s.package ?? ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b))))

  // What the open document loads: matches it can use now come first, the
  // rest (which would need another package) after them, fainter.
  let loaded = $state.raw<{ packages: Set<string>; encodings: Set<string> } | null>(null)
  /** Part of LaTeX itself since 2020: never needs loading. */
  const BUILT_IN = new Set(['textcomp'])
  const refreshLoaded = () => actions.loadedPackages().then((l) => (loaded = l), () => (loaded = null))
  const available = (s: LibrarySymbol) =>
    !loaded || ((!s.package || BUILT_IN.has(s.package) || loaded.packages.has(s.package)) && (!s.fontenc || loaded.encodings.has(s.fontenc)))

  // Recheck when the panel shows and whenever the document changes (another
  // file, a save, a build that reveals what the class loads).
  $effect(() => {
    void docKey
    if (active) refreshLoaded()
  })
  /** Available ones first, each group in its own order. */
  const availableFirst = (list: LibrarySymbol[]) => [...list.filter(available), ...list.filter((s) => !available(s))]

  const shown = $derived.by(() => {
    if (matches) return availableFirst(matches.map((id) => byId.get(id)).filter((s): s is LibrarySymbol => !!s))
    const q = query.trim().replace(/^\\/, '').toLowerCase()
    return availableFirst(
      symbols.filter(
        (s) => (pkg === '' || (s.package ?? '(base)') === pkg) && (!q || s.command.toLowerCase().includes(q) || (s.package ?? '').toLowerCase().includes(q)),
      ),
    )
  })
  const recentSymbols = $derived(recent.map((id) => byId.get(id)).filter((s): s is LibrarySymbol => !!s))

  // --- Recent symbols ---------------------------------------------------------

  const RECENT_KEY = 'recentSymbols'
  function loadRecent(): string[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    } catch {
      return []
    }
  }
  function used(s: LibrarySymbol): void {
    recent = [s.id, ...recent.filter((r) => r !== s.id)].slice(0, 16)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
    } catch {
      // not remembered; fine
    }
  }

  // --- Actions ------------------------------------------------------------------

  async function copy(text: string, s?: LibrarySymbol): Promise<void> {
    await navigator.clipboard.writeText(text)
    if (s) used(s)
    actions.note(`Copied ${text}`)
  }
  function insert(s: LibrarySymbol): void {
    used(s)
    actions.insert(s)
  }
  const usepackage = (s: LibrarySymbol) =>
    [s.fontenc ? `\\usepackage[${s.fontenc}]{fontenc}` : '', s.package ? `\\usepackage{${s.package}}` : ''].filter(Boolean).join('\n')

  // The right-click menu.
  let menu = $state.raw<{ s: LibrarySymbol; x: number; y: number; loaded: boolean | null } | null>(null)
  async function openMenu(e: MouseEvent, s: LibrarySymbol): Promise<void> {
    e.preventDefault()
    const needs = !!(s.package || s.fontenc)
    menu = { s, x: e.clientX, y: e.clientY, loaded: needs ? null : true }
    if (needs) {
      const loaded = await actions.hasPackage(s).catch(() => false)
      if (menu?.s.id === s.id) menu = { ...menu, loaded }
    }
    await tick()
    // Keep it on screen.
    const el = document.querySelector<HTMLElement>('.symbol-menu')
    if (el && menu) {
      const r = el.getBoundingClientRect()
      menu = { ...menu, x: Math.min(menu.x, innerWidth - r.width - 4), y: Math.min(menu.y, innerHeight - r.height - 4) }
    }
  }
  function onWindowPointer(e: PointerEvent): void {
    if (menu && !(e.target as HTMLElement).closest('.symbol-menu')) menu = null
  }
  const run = (f: () => void) => () => {
    f()
    menu = null
  }

  // --- Drawing and recognition --------------------------------------------------

  let canvas = $state<HTMLCanvasElement>()
  let strokes: Stroke[] = []
  let drawing: Stroke | null = null
  let hasInk = $state(false)
  let worker: Worker | null = null
  let seq = 0

  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('./detexify.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.seq !== seq) return
      recognising = false
      if ('error' in e.data) actions.note(`Recognition failed: ${e.data.error}`)
      else matches = e.data.results.map((r) => r.id)
    }
    return worker
  }

  function recognise(): void {
    if (!strokes.length) return
    recognising = true
    refreshLoaded() // the document may have gained a package since last time
    ensureWorker().postMessage({ seq: ++seq, strokes, limit: 40 } satisfies WorkerRequest)
  }

  function point(e: PointerEvent) {
    const r = canvas!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  // Two ways to draw: press and drag (mouse, pen, touchscreen, or a held
  // trackpad click), or trace: click the pad without dragging.
  //
  // Tracing captures the pointer (pointer lock) and, on Windows with a
  // Precision Touchpad, reads the trackpad itself (main/touchpad.ts): the
  // whole trackpad maps onto a fixed frame on the pad, so a finger drawn
  // across it draws the same shape there, and each touch-down and lift
  // starts and ends a stroke exactly, wherever the finger comes down. Taps
  // are ignored (tap-to-click would otherwise end the trace); pressing the
  // pad down, Enter or Esc finishes.
  //
  // Without that ("relative" mode), the pen follows the cursor's movement,
  // and a pause (the only sign of a lifted finger) ends a stroke.
  const PAUSE_MS = 350
  const LIFT_MS = 250 // no report for this long counts as a lift
  const FINISH_MS = 1500 // this long without drawing finishes the trace
  let finishTimer: ReturnType<typeof setTimeout> | undefined
  /** (Re)starts the countdown to finishing, once a stroke has ended. */
  function finishSoon(): void {
    clearTimeout(finishTimer)
    if (strokes.length) finishTimer = setTimeout(finishTrace, FINISH_MS)
  }
  const CLICK_PX = 4
  const CLICK_MS = 400
  let tracing = $state(false)
  let mode = $state<'connecting' | 'absolute' | 'relative'>('relative')
  let pen = { x: 0, y: 0 }
  let touching = false
  let traceStroke: Stroke | null = null
  let pauseTimer: ReturnType<typeof setTimeout> | undefined
  let pressedAt = 0
  // Absolute mode: the trackpad's frame on the pad, and the finger drawing.
  let frame = { x: 0, y: 0, w: 0, h: 0 }
  let finger: number | null = null
  let offTouchpad: (() => void) | null = null
  let touchpadProblem: string | null = null

  function down(e: PointerEvent): void {
    if (e.button !== 0) return
    if (tracing) {
      e.preventDefault()
      // A trackpad tap arrives as a click too; in absolute mode only the pad's own button finishes.
      if (mode !== 'absolute') finishTrace()
      return
    }
    canvas!.setPointerCapture(e.pointerId)
    pressedAt = performance.now()
    drawing = [point(e)]
    strokes.push(drawing)
    hasInk = true
    redraw()
  }
  function move(e: PointerEvent): void {
    if (tracing) {
      if (mode === 'relative') trace(e.movementX, e.movementY)
      return
    }
    if (!drawing) return
    drawing.push(point(e))
    redraw()
  }
  function up(): void {
    if (!drawing) return
    const stroke = drawing
    drawing = null
    // A click that didn't draw anything starts tracing instead.
    const xs = stroke.map((p) => p.x)
    const ys = stroke.map((p) => p.y)
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    if (size < CLICK_PX && performance.now() - pressedAt < CLICK_MS) {
      strokes.pop()
      hasInk = strokes.length > 0
      startTrace(stroke[0])
      return
    }
    recognise()
  }

  function startTrace(at: { x: number; y: number }): void {
    pen = { ...at }
    redraw() // without the click's dot
    // Chromium refuses a new lock straight after the last one ended.
    const request = canvas!.requestPointerLock() as unknown as Promise<void> | undefined
    request?.catch?.(() => actions.note('Click the pad again to trace'))
  }
  function onLockChange(): void {
    const locked = document.pointerLockElement === canvas
    if (locked && !tracing) {
      tracing = true
      traceStroke = null
      finger = null
      touching = false
      connectTouchpad()
      redraw()
    } else if (!locked && tracing) endTrace()
  }

  /** Reads the trackpad directly if it can; otherwise traces by following the cursor. */
  async function connectTouchpad(): Promise<void> {
    if (touchpadProblem) {
      mode = 'relative'
      return
    }
    mode = 'connecting'
    const r = await window.api.touchpadStart()
    if (!tracing) {
      if (r.ok) window.api.touchpadStop()
      return
    }
    if (!r.ok) {
      touchpadProblem = r.error
      mode = 'relative'
      actions.note(`Tracing follows the cursor: ${r.error}`)
      return
    }
    // The trackpad's shape, as large as fits on the pad.
    const w = canvas!.clientWidth
    const h = canvas!.clientHeight
    const m = 10
    const k = Math.min((w - 2 * m) / r.aspect, h - 2 * m)
    frame = { x: (w - k * r.aspect) / 2, y: (h - k) / 2, w: k * r.aspect, h: k }
    mode = 'absolute'
    offTouchpad = window.api.onTouchpad(onTouchpad)
    redraw()
  }

  function onTouchpad(e: TouchpadEvent): void {
    if (!tracing || mode !== 'absolute') return
    if (e.type === 'button') {
      if (e.down) finishTrace()
      return
    }
    const p = { x: frame.x + e.x * frame.w, y: frame.y + e.y * frame.h }
    if (finger === null) {
      if (!e.tip) return
      // A finger comes down: a new stroke starts where it touches.
      clearTimeout(finishTimer)
      finger = e.id
      traceStroke = [p]
      strokes.push(traceStroke)
      hasInk = true
    } else if (e.id !== finger) return // a second finger
    else if (e.tip) {
      const last = traceStroke![traceStroke!.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.5) traceStroke!.push(p)
    } else {
      liftFinger()
      return
    }
    pen = p
    touching = true
    // Reports stop if the lift itself goes missing: treat silence as one.
    clearTimeout(pauseTimer)
    pauseTimer = setTimeout(liftFinger, LIFT_MS)
    redraw()
  }

  function liftFinger(): void {
    clearTimeout(pauseTimer)
    if (finger === null) return
    finger = null
    touching = false
    traceStroke = null
    recognise()
    redraw()
    finishSoon()
  }
  function trace(dx: number, dy: number): void {
    if (!dx && !dy) return
    // The pen isn't held to the pad's edges (a stroke starting near one would
    // be squashed); the pad zooms out to show everything instead (see redraw).
    pen = { x: pen.x + dx, y: pen.y + dy }
    touching = true
    clearTimeout(finishTimer)
    if (!traceStroke) {
      traceStroke = [{ ...pen }]
      strokes.push(traceStroke)
      hasInk = true
    } else traceStroke.push({ ...pen })
    redraw()
    // A pause ends the stroke; the next movement starts another.
    clearTimeout(pauseTimer)
    pauseTimer = setTimeout(() => {
      traceStroke = null
      touching = false
      recognise()
      redraw()
      finishSoon()
    }, PAUSE_MS)
  }
  function finishTrace(): void {
    document.exitPointerLock() // onLockChange then ends the trace
  }
  function endTrace(): void {
    tracing = false
    clearTimeout(pauseTimer)
    clearTimeout(finishTimer)
    offTouchpad?.()
    offTouchpad = null
    if (mode !== 'relative') window.api.touchpadStop()
    mode = 'relative'
    finger = null
    touching = false
    traceStroke = null
    recognise()
    redraw()
  }

  export function clear(): void {
    if (tracing) finishTrace()
    strokes = []
    drawing = null
    hasInk = false
    matches = null
    seq++ // drop any answer still on its way
    recognising = false
    redraw()
  }

  function redraw(): void {
    if (!canvas) return
    const dpr = devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    // Tracing the trackpad itself: its outline is the frame it maps onto.
    const absolute = tracing && mode === 'absolute'
    if (absolute) {
      g.beginPath()
      g.roundRect(frame.x, frame.y, frame.w, frame.h, 6)
      g.fillStyle = '#f5f8fe'
      g.fill()
      g.lineWidth = 1
      g.strokeStyle = '#b6ccf2'
      g.stroke()
    }
    // Zoom out when ink traced by following the cursor (or its pen) runs past the edges.
    const pts = absolute ? [] : [...strokes.flat(), ...(tracing ? [pen] : [])]
    if (pts.length) {
      const m = 8
      const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))]
      const [y0, y1] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))]
      if (x0 < m || y0 < m || x1 > w - m || y1 > h - m) {
        const k = Math.min(1, (w - 2 * m) / Math.max(1, x1 - x0), (h - 2 * m) / Math.max(1, y1 - y0))
        const ox = (w - k * (x1 + x0)) / 2
        const oy = (h - k * (y1 + y0)) / 2
        g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy)
      }
    }
    const zoom = g.getTransform().a / dpr
    g.lineWidth = 3 / zoom
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#1f2328'
    for (const s of strokes) {
      g.beginPath()
      s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      if (s.length === 1) g.lineTo(s[0].x + 0.1, s[0].y)
      g.stroke()
    }
    // While tracing, the pen: filled while touching; between strokes, hollow
    // when following the cursor, and not shown at all for the trackpad (a
    // lifted finger has no position).
    if (tracing && mode !== 'connecting' && (touching || !absolute)) {
      g.beginPath()
      g.arc(pen.x, pen.y, 4 / zoom, 0, 2 * Math.PI)
      g.lineWidth = 1.5 / zoom
      g.strokeStyle = '#2f6fdb'
      g.fillStyle = '#2f6fdb'
      if (touching) g.fill()
      else g.stroke()
    }
  }

  onMount(() => {
    redraw()
    document.addEventListener('pointerlockchange', onLockChange)
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  })
  // The pad has no size while its tab is hidden; draw it once it shows.
  $effect(() => {
    if (active) tick().then(redraw)
  })
  onDestroy(() => worker?.terminate())

  const DETEXIFY = 'https://detexify.kirelabs.org'
  const DETEXIFY_NEXT = 'https://github.com/kirel/detexify-next'
  const openLink = (e: MouseEvent, url: string) => {
    e.preventDefault()
    window.api.openExternal(url)
  }
</script>

<svelte:window
  onpointerdown={onWindowPointer}
  onkeydown={(e) => {
    if (e.key === 'Escape') menu = null
    if (tracing && e.key === 'Enter') {
      e.preventDefault()
      finishTrace()
    }
  }}
/>

<div class="panel">
  <div class="pad" class:tracing>
    <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}></canvas>
    {#if tracing && !hasInk && mode === 'connecting'}
      <span class="hint">Connecting to the trackpad…</span>
    {:else if tracing && !hasInk && mode === 'absolute'}
      <span class="hint">Draw on the trackpad as if it were this box</span>
    {:else if tracing && !hasInk}
      <span class="hint">Trace on the trackpad — pause between strokes, click to finish</span>
    {:else if !hasInk}
      <span class="hint">Draw here, or click and trace on the trackpad</span>
    {/if}
    <div class="pad-bar">
      <span class="credit">
        <span class="credit-label" tabindex="0" role="button" aria-label="About Detexify">ⓘ Detexify</span>
        <span class="credit-card" role="tooltip">
          <strong>Forked from the OG, the MVP: Detexify</strong>
          <span>Drawing recognition, the symbol list and its pictures all come from Detexify, by Daniel Kirsch. Thank you!</span>
          <span class="links">
            <a href={DETEXIFY} onclick={(e) => openLink(e, DETEXIFY)}>detexify.kirelabs.org</a>
            <a href={DETEXIFY_NEXT} onclick={(e) => openLink(e, DETEXIFY_NEXT)}>Detexify Next on GitHub</a>
          </span>
          <span class="small muted">Code under the MIT licence; handwriting samples under the Open Database License.</span>
        </span>
      </span>
      {#if tracing && mode === 'absolute'}<span class="tracing-note">Trackpad · press it, Enter or Esc to finish</span>
      {:else if tracing}<span class="tracing-note">Tracing · click, Enter or Esc to finish</span>
      {:else if recognising}<span class="muted">Recognising…</span>{/if}
      <span class="spacer"></span>
      <button disabled={!hasInk} onclick={clear} title="Clear the drawing">Clear</button>
    </div>
  </div>

  {#if !matches}
    <div class="filters">
      <input bind:value={query} placeholder="Search {symbols.length || ''} symbols" spellcheck="false" />
      <select bind:value={pkg} title="Package">
        <option value="">All packages</option>
        {#each packages as p (p)}<option value={p || '(base)'}>{p || 'Base LaTeX'}</option>{/each}
      </select>
    </div>
  {/if}

  <div class="list">
    {#if loading}
      <p class="muted center">Loading symbols…</p>
    {:else}
      {#if !matches && !query && !pkg && recentSymbols.length}
        <div class="heading">Recent</div>
        <div class="grid">
          {#each recentSymbols as s (s.id)}{@render tile(s)}{/each}
        </div>
        <div class="heading">All symbols</div>
      {/if}
      {#if matches}<div class="heading">Best matches</div>{/if}
      <div class="grid">
        {#each shown as s (s.id)}{@render tile(s)}{/each}
      </div>
      {#if !shown.length}<p class="muted center">No symbols match.</p>{/if}
    {/if}
  </div>
</div>

{#snippet tile(s: LibrarySymbol)}
  <button
    class="tile"
    class:faint={!available(s)}
    title="{s.command}{s.package ? ` — \\usepackage{${s.package}}` : ''}{s.mode === 'text' ? ' (text mode)' : s.mode === 'math' ? ' (math mode)' : ''}{available(s) ? '' : `
Not loaded yet: inserting it adds the package`}
Click to copy, double-click to insert, right-click for more"
    onclick={() => copy(s.command, s)}
    ondblclick={() => insert(s)}
    oncontextmenu={(e) => openMenu(e, s)}
  >
    <img src={imageUrl(s)} alt={s.command} loading="lazy" draggable="false" />
    <span class="cmd">{s.command}</span>
  </button>
{/snippet}

{#if menu}
  {@const s = menu.s}
  <div class="symbol-menu" style:left="{menu.x}px" style:top="{menu.y}px" role="menu">
    <div class="menu-head">
      <img src={imageUrl(s)} alt="" />
      <div>
        <code>{s.command}</code>
        <div class="muted small">
          {s.mode === 'both' ? 'Math or text' : s.mode === 'math' ? 'Math mode' : 'Text mode'}{s.package ? ` · ${s.package}` : ' · base LaTeX'}{s.fontenc ? ` · ${s.fontenc} fonts` : ''}
        </div>
      </div>
    </div>
    <button onclick={run(() => copy(s.command, s))}>Copy <code>{s.command}</code></button>
    {#if s.mode === 'math'}
      <button onclick={run(() => copy(`$${s.command}$`, s))}>Copy as <code>${s.command}$</code></button>
    {/if}
    <button onclick={run(() => insert(s))}>
      Insert in the document{#if menu.loaded === false}, adding <code>{s.package ?? 'fontenc'}</code>{/if}
    </button>
    {#if s.package || s.fontenc}
      <hr />
      {#if menu.loaded === true}
        <button disabled>The document already loads {s.package ?? 'fontenc'}</button>
      {:else}
        <button disabled={menu.loaded === null} onclick={run(() => actions.addPackage(s))}>
          Add <code>{s.package ? `\\usepackage{${s.package}}` : `\\usepackage[${s.fontenc}]{fontenc}`}</code> to the preamble
        </button>
      {/if}
      <button onclick={run(() => copy(usepackage(s)))}>Copy the <code>\usepackage</code> line</button>
    {/if}
  </div>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .pad {
    position: relative;
    margin: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }
  canvas {
    display: block;
    width: 100%;
    height: 150px;
    touch-action: none;
    cursor: crosshair;
  }
  .hint {
    position: absolute;
    top: 56px;
    left: 12px;
    right: 12px;
    text-align: center;
    color: var(--muted);
    pointer-events: none;
  }
  .pad.tracing {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .tracing-note {
    color: var(--accent);
  }
  .pad-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px;
    border-top: 1px solid var(--border);
    font-size: 11px;
  }
  .pad-bar button {
    font-size: 11px;
    padding: 1px 8px;
  }
  .credit {
    position: relative;
  }
  .credit-label {
    color: var(--muted);
    cursor: help;
    outline: none;
  }
  .credit:hover .credit-label,
  .credit-label:focus {
    color: var(--accent);
  }
  /* The card hangs below the label and stays open while the pointer is on
     either (it starts right at the label's edge, so there's no gap to cross). */
  .credit-card {
    display: none;
    position: absolute;
    top: 100%;
    left: -6px;
    z-index: 50;
    width: 240px;
    padding: 10px 12px;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  }
  .credit:hover .credit-card,
  .credit:focus-within .credit-card {
    display: flex;
  }
  .credit-card .links {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .credit-card a {
    color: var(--accent);
    text-decoration: none;
  }
  .credit-card a:hover {
    text-decoration: underline;
  }
  .tile.faint {
    opacity: 0.4;
  }
  .tile.faint:hover {
    opacity: 0.8;
  }
  .spacer {
    flex: 1;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 11px;
  }
  .center {
    text-align: center;
  }
  .filters {
    display: flex;
    gap: 4px;
    padding: 0 8px 6px;
  }
  .filters input {
    flex: 1;
    min-width: 0;
    font: inherit;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    outline-color: var(--accent);
  }
  .filters select {
    width: 92px;
    font: inherit;
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 8px 8px;
  }
  .heading {
    color: var(--muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 6px 0 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 4px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 58px;
    padding: 4px 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    min-width: 0;
  }
  .tile img {
    height: 22px;
    max-width: 56px;
    object-fit: contain;
  }
  .tile .cmd {
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile:hover {
    border-color: var(--accent);
  }
  .symbol-menu {
    position: fixed;
    z-index: 200;
    min-width: 230px;
    padding: 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
  }
  .menu-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .menu-head img {
    height: 28px;
    max-width: 48px;
  }
  .symbol-menu button {
    border: none;
    background: none;
    text-align: left;
    padding: 5px 10px;
    border-radius: 4px;
  }
  .symbol-menu button:hover:not(:disabled) {
    background: var(--accent-soft);
  }
  .symbol-menu hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }
  code {
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 12px;
  }
</style>
