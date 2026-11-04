<script lang="ts">
  import { onMount } from 'svelte'
  import type { AboutInfo } from '@shared/about'

  /** Help → About endleaf: the version, Electron's and Chromium's, and the TeX distribution found. */
  let { info, onclose }: { info: AboutInfo; onclose: () => void } = $props()

  let dialog: HTMLDivElement
  onMount(() => dialog.focus())

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault()
      onclose()
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" bind:this={dialog} onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="About endleaf" tabindex="-1">
    <h2>endleaf</h2>
    <dl>
      <dt>Version</dt>
      <dd>{info.version}</dd>
      <dt>Electron</dt>
      <dd>{info.electron}</dd>
      <dt>Chromium</dt>
      <dd>{info.chromium}</dd>
      <dt>System</dt>
      <dd>{info.os}</dd>
      <dt>TeX</dt>
      <dd>{info.tex ?? 'none found'}</dd>
    </dl>
    <button onclick={onclose}>OK</button>
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
    padding-top: 18vh;
    z-index: 100;
  }
  .dialog {
    width: min(340px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 22px;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  h2 {
    margin: 0;
    font-family: var(--f-page);
    font-weight: 500;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    margin: 0;
  }
  dt {
    color: var(--ink-soft);
  }
  dd {
    margin: 0;
    user-select: text;
  }
  button {
    align-self: flex-end;
    font: inherit;
    padding: 4px 16px;
  }
</style>
