<script lang="ts">
  /**
   * The Bench look's file tabs: paper index tabs sticking out of the book's
   * left edge, or standing up from its head. They stay in view as the book
   * scrolls. Hover nudges a tab out and shows its ×; middle-click closes it.
   * The active tab is in the page's own paper.
   */
  let {
    tabs,
    active,
    dirty,
    edge,
    onselect,
    onclose,
  }: {
    tabs: string[]
    active: string | null
    dirty: Set<string>
    edge: 'left' | 'top'
    onselect: (rel: string) => void
    onclose: (rel: string) => void
  } = $props()

  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
</script>

{#if tabs.length}
  <div class="rail {edge}" role="tablist">
    {#each tabs as rel (rel)}
      <div
        class="itab"
        class:on={rel === active}
        role="tab"
        tabindex="0"
        aria-selected={rel === active}
        title={rel}
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
        {#if dirty.has(rel)}<span class="dot" title="Unsaved"></span>{/if}
        <span class="nm">{name(rel)}</span>
        <button
          class="x"
          title="Close (Ctrl+W)"
          aria-label="Close {name(rel)}"
          onclick={(e) => {
            e.stopPropagation()
            onclose(rel)
          }}>×</button
        >
      </div>
    {/each}
  </div>
{/if}

<style>
  .rail {
    position: absolute;
    z-index: 6;
    pointer-events: none;
    display: flex;
  }
  /* Down the left edge: the book's left edge (its board) is at --book-x. */
  .rail.left {
    top: 0;
    left: calc(var(--book-x) - 138px);
    width: 138px;
    /* the tabs tuck under the book's edge; their shadows still fall on the desk */
    clip-path: inset(-10px 0 -10px -10px);
    flex-direction: column;
    gap: 5px;
    padding-top: 94px;
  }
  /* Along the head, pinned at the top; the page fades out underneath. */
  .rail.top {
    top: 0;
    left: calc(var(--book-x) + 14px);
    right: 0;
    height: 64px;
    align-items: flex-end;
    gap: 6px;
    padding-bottom: 20px;
  }
  .rail.top::before {
    content: '';
    position: absolute;
    left: calc(-14px);
    width: calc(var(--leaf-w) + var(--board-l) + var(--board-r));
    top: 0;
    bottom: 0;
    background: linear-gradient(var(--desk) 55%, transparent);
    z-index: -1;
  }
  .itab {
    pointer-events: auto;
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 138px;
    height: 30px;
    padding: 0 16px 0 10px;
    background-color: var(--tabpaper);
    background-image: var(--grainimg);
    background-size: 512px;
    background-blend-mode: soft-light;
    color: var(--ink);
    font: 500 12.5px var(--f-ui);
    cursor: pointer;
    user-select: none;
    transition: transform 0.14s;
  }
  .left .itab {
    border-radius: 7px 0 0 7px;
    box-shadow: -1px 1px 0 rgba(0, 0, 0, 0.12), -2px 2px 5px rgba(0, 0, 0, 0.28);
    transform: translateX(8px);
  }
  .left .itab:hover {
    transform: translateX(3px);
  }
  .left .itab.on {
    transform: none;
  }
  .top .itab {
    height: 29px;
    border-radius: 7px 7px 0 0;
    box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.28);
    align-self: flex-end;
  }
  .top .itab:hover {
    transform: translateY(-3px);
  }
  .top .itab.on {
    height: 35px;
    transform: none;
  }
  .itab.on {
    background-color: var(--paper);
    font-weight: 700;
    z-index: 2;
  }
  .nm {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--detail);
    flex: none;
  }
  .x {
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    font-size: 13px;
    line-height: 1;
    opacity: 0;
  }
  .itab:hover .x {
    opacity: 0.7;
  }
  .x:hover:not(:disabled) {
    opacity: 1;
    background: rgba(0, 0, 0, 0.12);
  }
</style>
