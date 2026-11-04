<script lang="ts">
  /**
   * The first-time hint strip under the title bar (src/shared/hints.ts): one
   * hint at a time, closed for good with its ×.
   */
  import { hintText } from '@shared/hints'
  import Icon from './Icon.svelte'
  import { currentHint, dismissHint } from './hints.svelte'

  let {
    keyFor,
  }: {
    /** The key that runs a command, by id, from the registry ("Ctrl+S"); null without one. */
    keyFor: (commandId: string) => string | null
  } = $props()

  const hint = $derived(currentHint())
  const text = $derived(hint ? hintText(hint, keyFor) : '')
</script>

<div class="hint-strip" class:showing={!!hint} role="status">
  {#if hint}
    <span class="text">{text}</span>
    <button class="close" onclick={dismissHint} title="Don't show this again" aria-label="Dismiss this hint"><Icon name="x" size={14} /></button>
  {/if}
</div>

<style>
  .hint-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    background: var(--side);
  }
  .hint-strip.showing {
    padding: 6px 8px 6px 14px;
    border-bottom: 1px solid var(--line);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .close {
    display: grid;
    place-items: center;
    padding: 2px;
    border: none;
    background: none;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .close:hover {
    color: var(--ink);
  }
</style>
