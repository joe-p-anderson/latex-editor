<script lang="ts">
  /** No file open: the vault's marbling, with a small bookplate of the main keys. */
  let { logo }: { logo?: string } = $props()

  const KEYS: [string, string][] = [
    ['Ctrl P', 'Go to a file'],
    ['Ctrl Shift H', 'Search the vault'],
    ['Ctrl Shift B', 'Show or hide the sidebar'],
    ['Ctrl Alt V', 'Show or hide the PDF'],
    ['Ctrl J', 'Problems and log'],
  ]
</script>

<div class="empty">
  <div class="plate">
    <p class="exl">EX · LIBRIS</p>
    {#if logo}<img class="logo" src={logo} alt="" />{/if}
    <h3>No file open</h3>
    <div class="keys">
      {#each KEYS as [key, what] (key)}<kbd>{key}</kbd><span>{what}</span>{/each}
    </div>
  </div>
</div>

<style>
  .empty {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 24px;
    /* sized to the window, not the pane, so it holds still as the panes change */
    background: var(--marbleimg) center / cover fixed, var(--desk);
  }
  .plate {
    position: relative;
    width: min(360px, 100%);
    padding: 26px 32px 22px;
    text-align: center;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .plate::before {
    content: '';
    position: absolute;
    inset: 7px;
    border: 1.2px solid color-mix(in srgb, var(--ink) 65%, transparent);
    outline: 0.6px solid color-mix(in srgb, var(--ink) 50%, transparent);
    outline-offset: -4px;
    pointer-events: none;
  }
  .exl {
    font: 500 11px 'EB Garamond Variable', var(--f-page);
    letter-spacing: 0.34em;
    color: var(--ink-soft);
    margin: 0 0 6px;
  }
  .logo {
    display: block;
    width: 46px;
    height: 46px;
    margin: 0 auto 8px;
  }
  h3 {
    font: 500 24px 'EB Garamond Variable', var(--f-page);
    margin: 0 0 12px;
  }
  .keys {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    text-align: left;
    align-items: center;
    font: 15px var(--f-page);
    color: var(--ink-soft);
  }
  kbd {
    justify-self: end;
    font: 700 11px var(--f-mono);
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--ink) 40%, transparent);
    border-bottom-width: 2px;
    border-radius: 3px;
    color: var(--ink);
    white-space: nowrap;
  }
</style>
