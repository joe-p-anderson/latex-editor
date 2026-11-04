<script lang="ts">
  /**
   * No file open: the vault's marbling, with a small bookplate of the main
   * keys (from the command registry) and links to Help's commands.
   */
  import type { PlateKey } from './emptyPlate'

  let {
    logo,
    keys,
    links = [],
    onrun,
  }: {
    logo?: string
    keys: PlateKey[]
    /** Commands to offer as links, by id; only the registered ones are passed. */
    links?: { id: string; label: string }[]
    onrun: (id: string) => void
  } = $props()
</script>

<div class="empty">
  <div class="plate">
    <p class="exl">EX · LIBRIS</p>
    {#if logo}<img class="logo" src={logo} alt="" />{/if}
    <h3>No file open</h3>
    <div class="keys">
      {#each keys as k (k.id)}<kbd>{k.key}</kbd><span>{k.title}</span>{/each}
    </div>
    {#if links.length}
      <p class="links">
        {#each links as l, i (l.id)}{#if i}<span class="dot"> · </span>{/if}<button onclick={() => onrun(l.id)}>{l.label}</button>{/each}
      </p>
    {/if}
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
  .links {
    margin: 14px 0 0;
    font: 15px var(--f-page);
    color: var(--ink-soft);
  }
  .links button {
    font: inherit;
    color: var(--ink);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }
  .links button:hover {
    text-decoration-color: currentColor;
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
