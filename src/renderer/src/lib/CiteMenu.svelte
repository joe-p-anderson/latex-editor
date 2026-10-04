<script lang="ts" module>
  /** A line of the menu; `run` is called before the menu closes. */
  export interface CiteMenuItem {
    label: string
    /** Shown in mono after the label, e.g. \cite{key}. */
    code?: string
    /** After the code. */
    after?: string
    run: () => void
  }
</script>

<script lang="ts">
  /**
   * The right-click menu of a reference, in the cite picker and the
   * Citations view: who and where, then what can be done with it. It stays
   * on screen, and closes on Escape or a click elsewhere.
   */
  import { onMount, tick } from 'svelte'

  let {
    x,
    y,
    who,
    where,
    items,
    onclose,
  }: { x: number; y: number; who: string; where: string; items: CiteMenuItem[]; onclose: () => void } = $props()

  let el = $state<HTMLDivElement>()
  let left = $state(0)
  let top = $state(0)
  $effect(() => {
    left = x
    top = y
    tick().then(() => {
      if (!el) return
      const r = el.getBoundingClientRect()
      left = Math.min(x, innerWidth - r.width - 4)
      top = Math.min(y, innerHeight - r.height - 4)
    })
  })

  onMount(() => {
    const away = (e: PointerEvent) => !el?.contains(e.target as Node) && onclose()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onclose()
    }
    // Next tick, so the right-click that opened it doesn't close it.
    const t = setTimeout(() => window.addEventListener('pointerdown', away, true))
    window.addEventListener('keydown', esc, true)
    return () => (clearTimeout(t), window.removeEventListener('pointerdown', away, true), window.removeEventListener('keydown', esc, true))
  })

  // The item's action first, then close (the caller's state may be what the item reads).
  const run = (item: CiteMenuItem) => () => {
    item.run()
    onclose()
  }
</script>

<div class="cite-menu" bind:this={el} style:left="{left}px" style:top="{top}px" role="menu">
  <div class="menu-head">
    <span class="who">{who}</span>
    <div class="muted">{where}</div>
  </div>
  {#each items as item (item.label + (item.code ?? ''))}
    <button role="menuitem" onclick={run(item)}>{item.label}{#if item.code}{' '}<code>{item.code}</code>{/if}{item.after ?? ''}</button>
  {/each}
</div>

<style>
  .cite-menu {
    position: fixed;
    z-index: 200;
    min-width: 240px;
    max-width: 380px;
    padding: 4px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    font: 13px var(--f-ui);
  }
  .menu-head {
    padding: 6px 10px 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }
  .who {
    font-weight: 500;
  }
  .muted {
    font-size: 12px;
    color: var(--ink-soft);
  }
  button {
    border: none;
    background: none;
    text-align: left;
    padding: 5px 10px;
    border-radius: 4px;
    font: inherit;
  }
  button:hover {
    background: var(--sel);
  }
  code {
    font-family: Consolas, monospace;
    font-size: 12px;
  }
</style>
