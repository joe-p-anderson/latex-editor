<script lang="ts">
  import { onMount } from 'svelte'
  import { keyLabel, paletteLabel, searchCommands, type Command } from './commands'

  /**
   * Ctrl+Shift+P: every command that can run now (from the command
   * registry), as "Category: Title" with its key on the right. Type to
   * narrow, Enter runs.
   */
  let { commands, onpick, onclose }: { commands: Command[]; onpick: (c: Command) => void; onclose: () => void } = $props()

  let query = $state('')
  let selected = $state(0)
  let input: HTMLInputElement
  let list: HTMLDivElement

  const results = $derived(searchCommands(commands, query))
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
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="Run a command" tabindex="-1">
    <input bind:this={input} bind:value={query} placeholder="Run a command…" spellcheck="false" />
    <div class="list" bind:this={list}>
      {#each results as c, i (c.id)}
        <button class="row" class:sel={i === selected} onclick={() => onpick(c)} onmouseenter={() => (selected = i)}>
          <span class="name">{paletteLabel(c)}</span>
          {#if c.key}<kbd>{keyLabel(c.key)}</kbd>{/if}
        </button>
      {:else}
        <p class="empty">No commands match "{query}".</p>
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
    justify-content: space-between;
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
  kbd {
    flex: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
  }
  .empty {
    color: var(--ink-soft);
    text-align: center;
  }
</style>
