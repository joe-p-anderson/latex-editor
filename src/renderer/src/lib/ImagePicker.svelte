<script lang="ts">
  import { onMount } from 'svelte'
  import { fuzzyFilter } from '@shared/images'
  import { thumbnail } from './thumbnails'

  /**
   * A searchable grid of the vault's images. With `onpick`, Enter or a click
   * chooses one; without it (previewing from the file tree) it's view-only.
   */
  let {
    images,
    initial = '',
    title = 'Insert image',
    onpick,
    onclose,
  }: {
    images: string[]
    initial?: string
    title?: string
    onpick?: (rel: string) => void
    onclose: () => void
  } = $props()

  // `initial` only seeds the search box; typing takes over from there.
  // svelte-ignore state_referenced_locally
  let query = $state(initial)
  let selected = $state(0)
  let input: HTMLInputElement
  let grid: HTMLDivElement

  const results = $derived(fuzzyFilter(query, images))
  $effect(() => {
    void query
    selected = 0
  })

  onMount(() => input.focus())

  const COLS = 4
  function onkeydown(e: KeyboardEvent): void {
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key]
    if (move) {
      e.preventDefault()
      selected = Math.max(0, Math.min(results.length - 1, selected + move))
      grid.querySelectorAll('.card')[selected]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && results[selected] && onpick) {
      e.preventDefault()
      onpick(results[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }

  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  const folder = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label={title} tabindex="-1">
    <div class="top">
      <strong>{title}</strong>
      <input bind:this={input} bind:value={query} placeholder="Search {images.length} images…" spellcheck="false" />
      <span class="hint">{onpick ? '↵ insert · ' : ''}esc close</span>
    </div>
    <div class="grid" bind:this={grid}>
      {#each results as rel, i (rel)}
        <button class="card" class:sel={i === selected} onclick={() => (onpick ? onpick(rel) : (selected = i))} onmouseenter={() => (selected = i)} title={rel}>
          <div class="thumb">
            {#await thumbnail(rel)}
              <span class="loading">…</span>
            {:then url}
              {#if url}<img src={url} alt={name(rel)} loading="lazy" />{:else}<span class="loading">no preview</span>{/if}
            {/await}
          </div>
          <div class="label"><span class="dir">{folder(rel)}</span>{name(rel)}</div>
        </button>
      {:else}
        <p class="empty">No images match "{query}".</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 8vh;
    z-index: 100;
  }
  .dialog {
    width: min(880px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .top input {
    flex: 1;
    font: inherit;
    font-size: 14px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 5px;
    outline-color: var(--detail);
  }
  .hint {
    color: var(--ink-soft);
    font-size: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    padding: 12px;
    overflow: auto;
  }
  .card {
    display: flex;
    flex-direction: column;
    padding: 6px;
    border: 2px solid transparent;
    border-radius: 6px;
    background: var(--side);
    text-align: left;
    min-width: 0;
  }
  .card.sel {
    border-color: var(--detail);
    background: var(--sel);
  }
  .thumb {
    height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: 4px;
    overflow: hidden;
  }
  .thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .loading {
    color: var(--ink-soft);
    font-size: 12px;
  }
  .label {
    margin-top: 5px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dir {
    color: var(--ink-soft);
  }
  .empty {
    grid-column: 1 / -1;
    color: var(--ink-soft);
    text-align: center;
  }
</style>
