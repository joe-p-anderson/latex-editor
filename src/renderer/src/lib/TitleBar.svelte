<script lang="ts">
  /**
   * The frameless window's title bar: the logo and menus, the running title
   * (vault · file, which opens Go to File), the view toggles, the build note
   * and the ribbon bookmark that shows the build state. Windows draws the
   * window controls over the right-hand end.
   */
  import Icon from './Icon.svelte'

  export type BuildState = { kind: 'none' | 'ok' | 'busy' | 'err'; note: string; detail?: string }

  let {
    logo,
    vaultName,
    file,
    place = null,
    live,
    canLive,
    pdfOpen,
    panelOpen,
    build,
    onrunning,
    onlive,
    ontogglepdf,
    ontogglepanel,
    onribbon,
    nav = null,
  }: {
    logo?: string
    vaultName: string | null
    file: string | null
    /** Where the file stands in its paper (main §III), when it's part of one. */
    place?: string | null
    live: boolean
    canLive: boolean
    pdfOpen: boolean
    panelOpen: boolean
    build: BuildState
    onrunning: () => void
    onlive: (on: boolean) => void
    ontogglepdf: () => void
    ontogglepanel: () => void
    onribbon: () => void
    /** Back and forward through the places jumped between (Alt+Left, Alt+Right). */
    nav?: { canBack: boolean; canForward: boolean; onback: () => void; onforward: () => void } | null
  } = $props()

  const MENUS = ['File', 'Edit', 'View', 'Build', 'Tools']

  function openMenu(label: string, e: MouseEvent): void {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    window.api.popupMenu(label, box.left, box.bottom)
  }

  const fileName = $derived(file?.split('/').pop() ?? null)
</script>

<header class="titlebar">
  <div class="left">
    {#if logo}<img class="logo" src={logo} alt="" />{/if}
    <nav class="menus">
      {#each MENUS as label (label)}
        <button onclick={(e) => openMenu(label, e)}>{label}</button>
      {/each}
    </nav>
    {#if nav}
      <span class="nav">
        <button disabled={!nav.canBack} onclick={nav.onback} title="Back (Alt+Left)" aria-label="Back">‹</button>
        <button disabled={!nav.canForward} onclick={nav.onforward} title="Forward (Alt+Right)" aria-label="Forward">›</button>
      </span>
    {/if}
  </div>

  <button class="running" onclick={onrunning} title="Go to a file (Ctrl+P)">
    {#if vaultName}<span class="sc">{vaultName}</span>{#if fileName} · <i>{fileName}</i>{/if}{#if place}<span class="place"> · {place}</span>{/if}{:else}endleaf{/if}
  </button>

  <div class="right">
    {#if vaultName}
      <span class="seg">
        <button class="tbtn" class:on={live} disabled={!canLive} onclick={() => onlive(true)} title="Rendered in place, source under the cursor (Ctrl+Shift+L)">Live</button>
        <button class="tbtn" class:on={!live} disabled={!canLive} onclick={() => onlive(false)} title="Plain LaTeX source (Ctrl+Shift+L)">Source</button>
      </span>
      <button class="tbtn" class:on={pdfOpen} onclick={ontogglepdf} title="Show the PDF (Ctrl+Alt+V)" aria-label="PDF"><Icon name="book" size={16} /></button>
      <button class="tbtn" class:on={panelOpen} onclick={ontogglepanel} title="Problems and log (Ctrl+J)" aria-label="Problems and log"><Icon name="panel" size={16} /></button>
      {#if build.note}<span class="note" title={build.detail}>{build.note}</span>{/if}
      {#if build.kind !== 'none'}
        <button class="ribbon {build.kind}" onclick={onribbon} title={build.detail ?? build.note} aria-label="Build: {build.note}">
          {#if build.kind === 'ok'}<Icon name="check" size={12} />{:else if build.kind === 'err'}<Icon name="alert" size={12} />{/if}
        </button>
      {/if}
    {/if}
    <!-- room for the window controls Windows draws here -->
    <span class="controls"></span>
  </div>
</header>

<style>
  .titlebar {
    height: 36px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    background: var(--chrome);
    color: var(--chrome-ink);
    box-shadow: inset 0 -1px 0 var(--line);
    position: relative;
    z-index: 8;
    -webkit-app-region: drag;
    user-select: none;
  }
  button {
    -webkit-app-region: no-drag;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 12px;
    min-width: 0;
    overflow: hidden;
  }
  .logo {
    width: 20px;
    height: 20px;
    margin-right: 8px;
    flex: none;
  }
  .menus {
    display: flex;
  }
  .menus button {
    border: 0;
    padding: 4px 8px;
    border-radius: 3px;
    font-weight: 500;
    cursor: default;
  }
  .menus button:hover {
    background: var(--chrome-btn);
  }
  .nav {
    display: flex;
    margin-left: 6px;
  }
  .nav button {
    border: 0;
    width: 26px;
    padding: 0 0 2px;
    border-radius: 3px;
    font-size: 20px;
    line-height: 1;
  }
  .nav button:hover:not(:disabled) {
    background: var(--chrome-btn);
  }
  .nav button:disabled {
    opacity: 0.35;
  }
  .running {
    border: 0;
    padding: 2px 16px;
    border-radius: 3px;
    font: 600 16px var(--f-page);
    white-space: nowrap;
    max-width: 44vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .running:hover:not(:disabled) {
    background: var(--chrome-btn);
  }
  .sc {
    font-variant-caps: all-small-caps;
    letter-spacing: 0.1em;
  }
  .running i {
    font-weight: 500;
  }
  .place {
    font-weight: 500;
    color: var(--chrome-ink-soft, inherit);
  }
  .right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 100%;
    min-width: 0;
    gap: 6px;
  }
  .controls {
    /* the width of Windows' minimise, maximise and close buttons */
    width: 138px;
    flex: none;
  }
  .tbtn {
    height: 24px;
    min-width: 26px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    display: inline-grid;
    place-items: center;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--chrome-ink-soft);
  }
  .tbtn:hover:not(:disabled) {
    background: var(--chrome-btn);
    color: var(--chrome-ink);
  }
  .tbtn.on {
    background: var(--chrome-btn);
    color: var(--chrome-active);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.25);
  }
  .seg {
    display: inline-flex;
  }
  .seg .tbtn:first-child {
    border-radius: 4px 0 0 4px;
  }
  .seg .tbtn:last-child {
    border-radius: 0 4px 4px 0;
    border-left: 0;
  }
  .note {
    font-size: 12px;
    color: var(--chrome-ink-soft);
    margin: 0 2px 0 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  /* A silk bookmark hanging below the bar: ok, building or error. */
  .ribbon {
    --silk: var(--detail-chrome);
    flex: none;
    align-self: flex-start;
    width: 20px;
    height: 50px;
    margin: 0 8px 0 2px;
    border: 0;
    border-radius: 0;
    padding: 0 0 13px;
    color: rgba(255, 248, 236, 0.95);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--silk) 70%, #000) 0,
      var(--silk) 22%,
      color-mix(in srgb, var(--silk) 72%, #fff) 45%,
      var(--silk) 62%,
      color-mix(in srgb, var(--silk) 65%, #000) 100%
    );
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 8px), 0 100%);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4));
    position: relative;
    z-index: 9;
  }
  .ribbon:hover:not(:disabled) {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--silk) 70%, #000) 0,
      var(--silk) 22%,
      color-mix(in srgb, var(--silk) 72%, #fff) 45%,
      var(--silk) 62%,
      color-mix(in srgb, var(--silk) 65%, #000) 100%
    );
    filter: brightness(1.1) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4));
  }
  .ribbon.err {
    --silk: #a32a1e;
  }
  .ribbon.busy {
    height: 42px;
    animation: sway 1.2s ease-in-out infinite;
    transform-origin: top center;
  }
  @keyframes sway {
    50% {
      transform: rotate(3deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ribbon.busy {
      animation: none;
    }
  }
</style>
