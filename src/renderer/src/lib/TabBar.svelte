<script lang="ts">
  /**
   * The open files, one tab each. Click to switch, × or middle-click to
   * close, drag to reorder. A tab shows its folder too when another open
   * file has the same name.
   */
  let {
    tabs,
    active,
    dirty,
    onselect,
    onclose,
    onmove,
  }: {
    tabs: string[]
    active: string | null
    dirty: Set<string>
    onselect: (rel: string) => void
    onclose: (rel: string) => void
    /** Move the tab at index `from` so it ends up at index `to`. */
    onmove: (from: number, to: number) => void
  } = $props()

  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  const folder = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

  const clashes = $derived.by(() => {
    const seen = new Map<string, number>()
    for (const t of tabs) seen.set(name(t), (seen.get(name(t)) ?? 0) + 1)
    return seen
  })

  // Drag state: the tab being dragged and where it would land.
  let dragging = $state<number | null>(null)
  let dropAt = $state<number | null>(null)

  function ondragover(e: DragEvent, i: number): void {
    if (dragging === null) return
    e.preventDefault()
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dropAt = e.clientX < box.left + box.width / 2 ? i : i + 1
  }

  function ondrop(e: DragEvent): void {
    e.preventDefault()
    if (dragging !== null && dropAt !== null) {
      const to = dropAt > dragging ? dropAt - 1 : dropAt
      if (to !== dragging) onmove(dragging, to)
    }
    dragging = dropAt = null
  }
</script>

{#if tabs.length}
  <div class="tabs" role="tablist">
    {#each tabs as rel, i (rel)}
      <div
        class="tab"
        class:active={rel === active}
        class:drop-before={dropAt === i && dragging !== i && dragging !== i - 1}
        class:drop-after={dropAt === i + 1 && i === tabs.length - 1 && dragging !== i}
        role="tab"
        tabindex="0"
        aria-selected={rel === active}
        title={rel}
        draggable="true"
        ondragstart={(e) => {
          dragging = i
          e.dataTransfer?.setData('text/plain', rel)
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        }}
        ondragover={(e) => ondragover(e, i)}
        ondrop={ondrop}
        ondragend={() => (dragging = dropAt = null)}
        onclick={() => onselect(rel)}
        onkeydown={(e) => e.key === 'Enter' && onselect(rel)}
        onauxclick={(e) => {
          if (e.button === 1) {
            e.preventDefault()
            onclose(rel)
          }
        }}
        onmousedown={(e) => e.button === 1 && e.preventDefault()}
      >
        <span class="name">{name(rel)}</span>
        {#if (clashes.get(name(rel)) ?? 0) > 1 && folder(rel)}<span class="dir">{folder(rel)}</span>{/if}
        <button
          class="close"
          class:dirty={dirty.has(rel)}
          title="Close (Ctrl+W)"
          onclick={(e) => {
            e.stopPropagation()
            onclose(rel)
          }}
        >
          <span class="dot">●</span><span class="x">×</span>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .tabs {
    display: flex;
    overflow-x: auto;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    scrollbar-width: thin;
    flex: none;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px 5px 12px;
    border-right: 1px solid var(--border);
    cursor: pointer;
    white-space: nowrap;
    color: var(--muted);
    position: relative;
    user-select: none;
  }
  .tab:hover {
    background: var(--bg);
  }
  .tab.active {
    background: var(--bg);
    color: var(--text);
    box-shadow: inset 0 2px 0 var(--accent);
  }
  .tab.drop-before::before,
  .tab.drop-after::after {
    content: '';
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: 2px;
    background: var(--accent);
  }
  .tab.drop-before::before {
    left: -1px;
  }
  .tab.drop-after::after {
    right: -1px;
  }
  .dir {
    font-size: 11px;
    color: var(--muted);
  }
  .close {
    border: none;
    background: none;
    padding: 0;
    width: 18px;
    height: 18px;
    line-height: 18px;
    border-radius: 3px;
    color: var(--muted);
    font-size: 14px;
  }
  .close .dot {
    display: none;
    font-size: 10px;
  }
  .close.dirty .dot {
    display: inline;
  }
  .close.dirty .x {
    display: none;
  }
  .close:hover .dot {
    display: none;
  }
  .close:hover .x {
    display: inline;
  }
  .tab:not(.active):not(:hover) .close:not(.dirty) {
    visibility: hidden;
  }
</style>
