<script lang="ts">
  import { onMount } from 'svelte'
  import { fuzzyFilter, isImage } from '@shared/images'

  /** Ctrl+P: type part of a file name, Enter opens it. */
  let { files, onpick, onclose }: { files: string[]; onpick: (rel: string) => void; onclose: () => void } = $props()

  let query = $state('')
  let selected = $state(0)
  let input: HTMLInputElement
  let list: HTMLDivElement

  const MAX = 60
  // Sources before images: "HW2" means HW2_….tex, not hw2_diagram.pdf.
  const results = $derived.by(() => {
    const hits = fuzzyFilter(query, files)
    return [...hits.filter((f) => !isImage(f)), ...hits.filter(isImage)].slice(0, MAX)
  })
  $effect(() => {
    void query
    selected = 0
  })

  onMount(() => input.focus())

  function onkeydown(e: KeyboardEvent): void {
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[e.key]
    if (move) {
      e.preventDefault()
      selected = Math.max(0, Math.min(results.length - 1, selected + move))
      list.querySelectorAll('.row')[selected]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && results[selected]) {
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
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="Open file" tabindex="-1">
    <input bind:this={input} bind:value={query} placeholder="Open a file by name…  (type / to match folders too)" spellcheck="false" />
    <div class="list" bind:this={list}>
      {#each results as rel, i (rel)}
        <button class="row" class:sel={i === selected} onclick={() => onpick(rel)} onmouseenter={() => (selected = i)}>
          <span class="name">{name(rel)}</span><span class="dir">{folder(rel)}</span>
        </button>
      {:else}
        <p class="empty">No files match "{query}".</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
    z-index: 100;
  }
  .dialog {
    width: min(620px, 92vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
    overflow: hidden;
  }
  input {
    font: inherit;
    font-size: 14px;
    margin: 10px;
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 5px;
    outline-color: var(--detail);
  }
  .list {
    overflow: auto;
    padding: 0 6px 6px;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    border: none;
    border-radius: 4px;
    background: none;
    padding: 5px 8px;
    text-align: left;
  }
  .row.sel {
    background: var(--sel);
  }
  .dir {
    color: var(--ink-soft);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    color: var(--ink-soft);
    text-align: center;
  }
</style>
