<script lang="ts">
  /**
   * The theme builder: global choices (look, page, type) first, then this
   * vault's endpaper. Every change applies at once and is saved.
   */
  import {
    BINDINGS,
    DESKS,
    LINE_LENGTH,
    LOOKS,
    MARBLINGS,
    STOCK,
    TAB_EDGES,
    TEXT_SIZES,
    TONES,
    TYPEFACES,
    pageFontStack,
    type AppAppearance,
    type Page,
    type VaultAppearance,
  } from '@shared/appearance'
  import { PALETTE_THEMES, smallLogo } from './appearance'
  import { marbleCss } from './marbles.svelte'

  let {
    app,
    endpaper,
    vaultName,
    onapp,
    onvault,
    ondefaults,
  }: {
    app: AppAppearance
    /** The open vault's endpaper; null when no vault is open. */
    endpaper: VaultAppearance | null
    vaultName: string | null
    onapp: (changes: Partial<AppAppearance>) => void
    onvault: (changes: Partial<VaultAppearance>) => void
    /** Restores every setting, global and this vault's, to its default. */
    ondefaults: () => void
  } = $props()

  const bench = $derived(app.look === 'bench')
  const black = $derived(app.page === 'black')
  const stock = $derived(STOCK[endpaper?.palette ?? 'bookbinders-blue'])
  // The paper is named for the palette's stock.
  const pages = $derived<[Page, string][]>([
    ['paper', stock.name],
    ['black', 'Black'],
  ])
</script>

{#snippet choices<T>(options: [T, string][], current: T, pick: (v: T) => void, disabled = false)}
  <div class="choices">
    {#each options as [value, label] (value)}
      <button class:on={value === current} {disabled} onclick={() => pick(value)}>{label}</button>
    {/each}
  </div>
{/snippet}

<div class="panel">
  <div class="head">
    <span class="title">Appearance</span>
    <button class="small" title="Return every setting to its default" onclick={ondefaults}>Defaults</button>
  </div>

  <div class="body">
    <div class="group">
      <div class="label">Look</div>
      {@render choices(LOOKS, app.look, (look) => onapp({ look }))}
      <p class="hint">{bench ? 'A book on a desk, bound in this vault’s endpapers.' : 'A flat editor with marbled accents.'}</p>
    </div>

    <div class="group">
      <div class="label">Page</div>
      {@render choices(pages, app.page, (page) => onapp({ page }))}
    </div>

    {#if bench}
      <div class="group">
        <div class="label">File tabs</div>
        {@render choices(TAB_EDGES, app.tabs, (tabs) => onapp({ tabs }))}
      </div>
      <div class="group">
        <div class="label">Desk</div>
        {@render choices(DESKS, app.desk, (desk) => onapp({ desk }))}
      </div>
      <div class="group">
        <div class="label">Binding</div>
        {@render choices(BINDINGS, app.binding, (binding) => onapp({ binding }), black)}
        {#if black}<p class="hint">Black pages are bound in dark leather.</p>{/if}
      </div>
    {/if}

    {#if endpaper}
      <div class="section">This vault · {vaultName}</div>
      <div class="group">
        <div class="label">Palette</div>
        <div class="swatches">
          {#each PALETTE_THEMES as theme (theme.id)}
            {@const id = theme.id as VaultAppearance['palette']}
            {@const logo = smallLogo(id)}
            <button class="swatch" class:on={id === endpaper.palette} onclick={() => onvault({ palette: id })}>
              <span class="sheet" style:background-image={marbleCss({ ...endpaper, palette: id }, 'small')}>
                {#if logo}<img src={logo} alt="" />{/if}
              </span>
              <span>{theme.name}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="group">
        <div class="label">Marbling</div>
        <div class="swatches">
          {#each MARBLINGS as [id, name] (id)}
            <button class="swatch" class:on={id === endpaper.marbling} onclick={() => onvault({ marbling: id })}>
              <span class="sheet" style:background-image={marbleCss({ ...endpaper, marbling: id }, 'small')}></span>
              <span>{name}</span>
            </button>
          {/each}
        </div>
        <div class="row">
          {@render choices(TONES, endpaper.tone, (tone) => onvault({ tone }))}
          <button class="small" title="Marble a fresh sheet in the same pattern" onclick={() => onvault({ seed: Math.floor(Math.random() * 100000) })}>Remarble</button>
        </div>
      </div>
    {/if}

    <div class="section">Type</div>
    <div class="group">
      <div class="label">Line length <output>{app.lineLength} characters</output></div>
      <input
        type="range"
        min={LINE_LENGTH.min}
        max={LINE_LENGTH.max}
        step="1"
        value={app.lineLength}
        aria-label="Line length in characters"
        oninput={(e) => onapp({ lineLength: +e.currentTarget.value })}
      />
    </div>
    <div class="group">
      <div class="label">Text size</div>
      {@render choices(
        TEXT_SIZES.map((n) => [n, `${n} px`] as [number, string]),
        app.textSize,
        (textSize) => onapp({ textSize }),
      )}
    </div>
    <div class="group">
      <div class="label">Typeface</div>
      <div class="choices">
        {#each TYPEFACES as face (face)}
          <button class:on={face === app.typeface} style:font-family={pageFontStack(face)} onclick={() => onapp({ typeface: face })}>{face}</button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 6px;
  }
  .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 16px;
  }
  .group {
    padding: 4px 12px 10px;
  }
  .label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
    font: 600 14px var(--f-page);
    letter-spacing: 0.1em;
    font-variant-caps: all-small-caps;
    color: var(--ink-soft);
  }
  .label output {
    font: 12px var(--f-ui);
    letter-spacing: 0;
    font-variant-caps: normal;
    font-variant-numeric: tabular-nums;
  }
  .section {
    margin: 10px 12px 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--ink-soft);
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .choices button,
  .small {
    border-color: color-mix(in srgb, var(--ink) 22%, transparent);
    padding: 4px 9px;
  }
  .small {
    padding: 2px 8px;
    font-size: 12px;
  }
  .choices button.on {
    border-color: var(--detail);
    background: color-mix(in srgb, var(--detail) 18%, transparent);
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px 8px;
  }
  .swatch {
    border: 0;
    padding: 0;
    background: none;
    text-align: left;
    font-size: 11.5px;
    line-height: 1.25;
  }
  .swatch:hover:not(:disabled) {
    background: none;
  }
  .sheet {
    position: relative;
    display: block;
    height: 40px;
    margin-bottom: 4px;
    background-size: cover;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    outline: 2px solid transparent;
    outline-offset: 2px;
  }
  .swatch.on .sheet {
    outline-color: var(--detail);
  }
  .sheet img {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 16px;
    height: 16px;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--detail);
    background: none;
  }
</style>
