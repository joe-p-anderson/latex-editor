<script lang="ts">
  import { onMount } from 'svelte'

  /** A one-line question: Enter submits, Escape cancels. */
  let {
    title,
    initial = '',
    hint = '',
    onsubmit,
    oncancel,
  }: { title: string; initial?: string; hint?: string; onsubmit: (value: string) => void; oncancel: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let value = $state(initial)
  let input: HTMLInputElement
  onMount(() => {
    input.focus()
    input.select()
  })

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      onsubmit(value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      oncancel()
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-label={title} tabindex="-1">
    <strong>{title}</strong>
    <input bind:this={input} bind:value {onkeydown} spellcheck="false" />
    {#if hint}<span class="hint">{hint}</span>{/if}
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
    padding-top: 14vh;
    z-index: 100;
  }
  .dialog {
    width: min(460px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  input {
    font: inherit;
    font-family: Consolas, 'Cascadia Mono', monospace;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 5px;
    outline-color: var(--detail);
  }
  .hint {
    color: var(--ink-soft);
    font-size: 12px;
  }
</style>
