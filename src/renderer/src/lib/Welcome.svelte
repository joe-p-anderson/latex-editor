<script lang="ts">
  /**
   * The welcome screen: the front endpaper filling the window, with a
   * bookplate listing the recent vaults. Hovering a vault shows its endpaper.
   */
  import { onMount } from 'svelte'
  import type { RecentVault } from '@shared/api'
  import { defaultVaultAppearance, type VaultAppearance } from '@shared/appearance'
  import { logoUrl } from './appearance'
  import { marbleCss } from './marbles.svelte'

  let {
    onopen,
    onopenat,
    onnew,
  }: {
    /** Open a folder with the system picker. */
    onopen: () => void
    onopenat: (root: string) => void
    onnew: () => void
  } = $props()

  let recent = $state<RecentVault[]>([])
  let preview = $state<VaultAppearance | null>(null)
  onMount(() => {
    window.api.recentVaults().then((r) => (recent = r))
  })

  const shown = $derived(preview ?? recent[0]?.appearance ?? defaultVaultAppearance('endleaf'))

  // Hover lingers a moment before the endpaper changes, so sweeping across the list doesn't flicker.
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  function hover(a: VaultAppearance): void {
    clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => (preview = a), 140)
  }

  function when(ms: number): string {
    const days = Math.floor((Date.now() - ms) / 86_400_000)
    if (days < 1) return 'today'
    if (days < 2) return 'yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 14) return 'last week'
    return new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  }
</script>

<div class="threshold" style:background-image={marbleCss(shown)}>
  <div class="plate">
    <p class="exl">EX · LIBRIS</p>
    <div class="brand">
      <img class="logo" src={logoUrl(shown.palette, 'full')} alt="" />
      <div>
        <h1>endleaf</h1>
        <p>LaTeX vaults, kept on your own disk.</p>
      </div>
    </div>
    {#if recent.length}
      <p class="lbl">Recent vaults</p>
      <div class="vaults">
        {#each recent as v (v.root)}
          <button class="vault" onclick={() => onopenat(v.root)} onpointerenter={() => hover(v.appearance)} onfocus={() => hover(v.appearance)}>
            <span class="chip" style:background-image={marbleCss(v.appearance, 'small')}></span>
            <span class="what"><b>{v.name}</b><small>{v.root}</small></span>
            <span class="when">{when(v.opened)}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="actions">
      <button class="btn primary" onclick={onopen}>Open a folder…</button>
      <button class="btn" onclick={onnew}>New vault…</button>
    </div>
  </div>
</div>

<style>
  .threshold {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    overflow: auto;
    background-color: var(--desk);
    background-position: center;
    background-size: cover;
  }
  .plate {
    position: relative;
    width: min(600px, 100%);
    padding: 30px 42px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  /* the bookplate's ruled border */
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
    text-align: center;
    color: var(--ink-soft);
    margin: 0 0 6px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 18px;
  }
  .logo {
    width: 78px;
    height: 78px;
    flex: none;
  }
  h1 {
    font: 500 50px/1 'EB Garamond Variable', var(--f-page);
    margin: 0;
    letter-spacing: 0.01em;
  }
  .brand p {
    margin: 6px 0 0;
    font: italic 16px var(--f-page);
    color: var(--ink-soft);
  }
  .lbl {
    font: 500 12px 'EB Garamond Variable', var(--f-page);
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--ink-soft);
    margin: 0 0 4px;
    padding-bottom: 3px;
    border-bottom: 0.8px solid color-mix(in srgb, var(--ink) 35%, transparent);
  }
  .vaults {
    display: flex;
    flex-direction: column;
    margin: 4px -10px 18px;
  }
  .vault {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 6px 10px;
    border: 0;
    border-radius: 0;
    text-align: left;
  }
  .vault:hover:not(:disabled),
  .vault:focus-visible {
    background: color-mix(in srgb, var(--ink) 7%, transparent);
  }
  .chip {
    width: 44px;
    height: 30px;
    display: block;
    background-size: cover;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .what {
    min-width: 0;
  }
  .what b {
    display: block;
    font: 600 16px var(--f-page);
  }
  .what small {
    display: block;
    font: 12.5px var(--f-mono);
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    font: italic 14px var(--f-page);
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn {
    border: 1px solid color-mix(in srgb, var(--ink) 45%, transparent);
    padding: 6px 14px;
    border-radius: 2px;
    font: 600 14px var(--f-page);
  }
  .btn.primary {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ink) 85%, var(--paper));
  }
</style>
