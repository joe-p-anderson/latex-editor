<script lang="ts" generics="T">
  import { onMount, type Snippet } from 'svelte'

  /**
   * The search-and-pick dialog that Go to File (QuickOpen.svelte) and Run
   * Command (CommandPalette.svelte) share: a box to type in over a list of
   * `results`, which the caller narrows from `query`. Arrows and Page
   * Up/Down move, Enter or a click picks, Escape or a click outside closes.
   */
  let {
    label,
    placeholder,
    results,
    key,
    query = $bindable(''),
    empty,
    row,
    onpick,
    onclose,
  }: {
    /** The dialog's accessible name. */
    label: string
    placeholder: string
    results: T[]
    /** Each result's unique key. */
    key: (item: T) => string
    query?: string
    /** Shown when nothing matches. */
    empty: string
    /** A result's row content. */
    row: Snippet<[T]>
    onpick: (item: T) => void
    onclose: () => void
  } = $props()

  let selected = $state(0)
  let input: HTMLInputElement
  let list: HTMLDivElement

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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label={label} tabindex="-1">
    <input bind:this={input} bind:value={query} {placeholder} spellcheck="false" />
    <div class="list" bind:this={list}>
      {#each results as item, i (key(item))}
        <button class="row" class:sel={i === selected} onclick={() => onpick(item)} onmouseenter={() => (selected = i)}>
          {@render row(item)}
        </button>
      {:else}
        <p class="empty">{empty}</p>
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
  .empty {
    color: var(--ink-soft);
    text-align: center;
  }
</style>
