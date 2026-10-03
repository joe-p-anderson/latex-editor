<script lang="ts" module>
  /** A core view ('files', 'contents', 'search', 'cite', 'appearance', 'plugins') or a plugin's ('<plugin>:<id>'). */
  export type View = string
  export interface ViewButton {
    id: View
    /** A name from icons.ts, or SVG markup (a plugin's own icon). */
    icon: string
    tip: string
  }
</script>

<script lang="ts">
  /**
   * The views down the left edge. Tools under the "tools" rule appear only
   * when the vault needs them; the vault's swatch and the gear sit at the
   * foot. In the Plain look a marbled strip runs down its right edge.
   */
  import Icon from './Icon.svelte'

  let {
    views,
    tools,
    current,
    open,
    swatch,
    logo,
    onselect,
  }: {
    views: ViewButton[]
    /** Contextual tools; the "tools" rule shows only when there are some. */
    tools: ViewButton[]
    current: View
    /** Whether the sidebar is showing (the current view is lit only then). */
    open: boolean
    /** CSS background for the vault's swatch. */
    swatch: string
    logo?: string
    onselect: (view: View) => void
  } = $props()
</script>

{#snippet button(v: ViewButton)}
  <button class="act" class:on={open && current === v.id} onclick={() => onselect(v.id)} title={v.tip} aria-label={v.tip}>
    <Icon name={v.icon} size={23} />
  </button>
{/snippet}

<nav class="activity" aria-label="Views">
  {#each views as v (v.id)}{@render button(v)}{/each}
  {#if tools.length}
    <div class="sep"></div>
    <div class="label" title="Tools that appear only when this vault needs them">tools</div>
    {#each tools as v (v.id)}{@render button(v)}{/each}
  {/if}
  <div class="spacer"></div>
  <button class="act" class:on={open && current === 'plugins'} onclick={() => onselect('plugins')} title="Plugins" aria-label="Plugins">
    <Icon name="plugin" size={23} />
  </button>
  <button class="act" onclick={() => onselect('appearance')} title="This vault’s endpaper and paper" aria-label="Endpaper">
    <span class="swatch" style:background-image={swatch}>{#if logo}<img src={logo} alt="" />{/if}</span>
  </button>
  <button class="act" class:on={open && current === 'appearance'} onclick={() => onselect('appearance')} title="Appearance" aria-label="Appearance">
    <Icon name="gear" size={23} />
  </button>
</nav>

<style>
  .activity {
    width: 52px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 9px 6px 0;
    position: relative;
    background: var(--chrome);
    color: var(--chrome-ink-soft);
    z-index: 4;
  }
  /* the marbled hinge */
  .activity::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 9px;
    background: var(--marbleimg) center / cover;
    box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.2);
  }
  .act {
    width: 40px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 0;
    padding: 0;
    position: relative;
    color: inherit;
  }
  .act:hover:not(:disabled) {
    background: none;
    color: var(--chrome-ink);
  }
  .act.on {
    color: var(--chrome-active);
  }
  .act.on::before {
    content: '';
    position: absolute;
    left: 1px;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 2px;
    background: var(--foil);
  }
  .act :global(.ic) {
    stroke-width: 1.9;
  }
  .sep {
    width: 26px;
    border-top: 1px solid var(--line);
    margin: 8px 0;
  }
  .label {
    font: 700 8.5px var(--f-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .spacer {
    flex: 1;
  }
  .swatch {
    position: relative;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    overflow: hidden;
    display: block;
    background-size: cover;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }
  .swatch img {
    position: absolute;
    inset: 3px;
    width: 18px;
    height: 18px;
  }
</style>
