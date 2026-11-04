<script lang="ts">
  import { onMount } from 'svelte'
  import type { Command } from './commands'
  import { shortcutGroups } from './shortcuts'

  /**
   * Help → Keyboard Shortcuts (Ctrl+K Ctrl+S): every command with a key,
   * from the command registry, grouped by category, with a box that narrows
   * by title, category or key ("ctrl+shift"). Read-only: no rebinding.
   * Looks like the pickers (Picker.svelte); Escape or a click outside closes.
   */
  let { commands, onclose }: { commands: Command[]; onclose: () => void } = $props()

  let query = $state('')
  let input: HTMLInputElement
  const groups = $derived(shortcutGroups(commands, query))

  onMount(() => input.focus())

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="Keyboard shortcuts" tabindex="-1">
    <input bind:this={input} bind:value={query} placeholder="Search keyboard shortcuts…  (a name, a menu, or keys like ctrl+shift)" spellcheck="false" />
    <div class="list">
      {#each groups as g (g.category)}
        <h3>{g.category}</h3>
        <dl>
          {#each g.items as s (s.id)}
            <div class="row">
              <dt>{s.title}</dt>
              <dd><kbd>{s.key}</kbd></dd>
            </div>
          {/each}
        </dl>
      {:else}
        <p class="empty">No shortcuts match "{query}".</p>
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
    padding: 0 14px 10px;
  }
  h3 {
    margin: 10px 0 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  dl {
    margin: 0;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 3px 0;
  }
  dt {
    flex: 1;
  }
  dd {
    margin: 0;
  }
  kbd {
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
