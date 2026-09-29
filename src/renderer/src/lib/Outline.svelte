<script lang="ts">
  import type { OutlineItem } from '@shared/latexedit'

  let {
    items,
    cursorLine,
    onjump,
  }: {
    items: OutlineItem[]
    /** 1-based; the heading the cursor is under is highlighted. */
    cursorLine: number
    onjump: (line: number) => void
  } = $props()

  // The last heading at or above the cursor.
  const current = $derived(items.findLastIndex((it) => it.line <= cursorLine))

  let list = $state<HTMLElement>()
  $effect(() => {
    // Keep the highlighted row in view as the cursor moves through the file.
    void current
    list?.querySelector('.current')?.scrollIntoView({ block: 'nearest' })
  })
</script>

<section>
  <h2>Outline</h2>
  <nav bind:this={list}>
    {#each items as item, i (i)}
      <button
        class="row {item.kind}"
        class:current={i === current}
        style:padding-left="{10 + item.depth * 14}px"
        title="Line {item.line}"
        onclick={() => onjump(item.line)}
      >
        {item.title}
      </button>
    {:else}
      <p class="empty">No sections or questions</p>
    {/each}
  </nav>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  h2 {
    margin: 0;
    padding: 6px 10px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  nav {
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding-bottom: 4px;
  }
  .row {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    border-radius: 0;
    background: none;
    padding-top: 2px;
    padding-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row:hover {
    background: var(--accent-soft);
  }
  .row.chapter,
  .row.section {
    font-weight: 600;
  }
  .row.question {
    color: var(--muted);
  }
  .row.current {
    background: var(--accent-soft);
    color: var(--text);
  }
  .empty {
    margin: 4px 10px;
    color: var(--muted);
  }
</style>
