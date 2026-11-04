<script lang="ts">
  /**
   * The first-time hint strip under the title bar (src/shared/hints.ts): one
   * hint at a time, closed for good with its ×.
   */
  import Icon from './Icon.svelte'
  import { currentHint, dismissHint } from './hints.svelte'

  const hint = $derived(currentHint())
</script>

<div class="hint-strip" class:showing={!!hint} role="status">
  {#if hint}
    <span class="text">{hint.text}</span>
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
