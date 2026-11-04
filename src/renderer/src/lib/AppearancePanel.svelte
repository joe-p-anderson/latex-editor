<script lang="ts" module>
  /** Where the panel opens: at the top, or scrolled to this vault's palette. */
  export type AppearanceSection = 'top' | 'palette'
</script>

<script lang="ts">
  /**
   * The Appearance panel. Look, Page and Type are app-wide (saved in the app's
   * settings); Palette and Endpaper belong to the open vault (saved in its
   * .vault.json). Every change applies at once and is saved.
   */
  import { tick } from 'svelte'
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
    focus = { section: 'top', at: 0 },
    app,
    endpaper,
    vaultName,
    folderName = '',
    onname = () => {},
    onapp,
    onvault,
    ondefaults,
  }: {
    /** Where to scroll to; a new `at` scrolls again. */
    focus?: { section: AppearanceSection; at: number }
    app: AppAppearance
    /** The open vault's endpaper; null when no vault is open. */
    endpaper: VaultAppearance | null
    vaultName: string | null
    /** The vault folder's name, which the vault goes by when it has no name of its own. */
    folderName?: string
    /** Names the vault (blank for the folder's name). */
    onname?: (name: string) => void
    onapp: (changes: Partial<AppAppearance>) => void
    onvault: (changes: Partial<VaultAppearance>) => void
    /** Restores every setting, app-wide and this vault's, to its default. */
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

  let body = $state<HTMLDivElement>()
  let palette = $state<HTMLElement>()
  $effect(() => {
    const { section, at } = focus
    void at
    tick().then(() => {
      if (!body) return
      body.scrollTop = section === 'palette' && palette ? palette.offsetTop : 0
    })
  })
</script>

{#snippet choices<T>(options: [T, string][], current: T, pick: (v: T) => void, disabled = false)}
  <div class="choices">
    {#each options as [value, label] (value)}
      <button class:on={value === current} {disabled} onclick={() => pick(value)}>{label}</button>
    {/each}
  </div>
{/snippet}

{#snippet heading(title: string, scope: string, tip?: string)}
  <h3 class="section-title" title={tip}>{title}</h3>
  <div class="scope" title={scope}>{scope}</div>
{/snippet}

<div class="panel">
  <div class="head">
    <span class="title">Appearance</span>
    <button class="small" title="Return every setting, app-wide and this vault’s, to its default" onclick={ondefaults}>Defaults</button>
  </div>

  <div class="body" bind:this={body}>
    <section class="section" aria-label="Look">
      {@render heading('Look', 'All vaults')}
      <div class="group">
        {@render choices(LOOKS, app.look, (look) => onapp({ look }))}
        <p class="hint">{bench ? 'A book on a desk, bound in this vault’s endpapers.' : 'A flat editor with marbled accents.'}</p>
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
      {/if}
    </section>

    <section class="section" aria-label="Page">
      {@render heading('Page', 'All vaults', 'The paper your document sits on')}
      <div class="group">
        {@render choices(pages, app.page, (page) => onapp({ page }))}
      </div>
      {#if bench}
        <div class="group">
          <div class="label">Binding</div>
          {@render choices(BINDINGS, app.binding, (binding) => onapp({ binding }), black)}
          {#if black}<p class="hint">Black pages are bound in dark leather.</p>{/if}
        </div>
      {/if}
    </section>

    <section class="section" aria-label="Type">
      {@render heading('Type', 'All vaults')}
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
      <div class="group">
        <label class="check">
          <input type="checkbox" checked={app.showSpaces} onchange={(e) => onapp({ showSpaces: e.currentTarget.checked })} />
          Show spaces in Live view
        </label>
      </div>
    </section>

    {#if endpaper}
      <section class="section" aria-label="Palette" bind:this={palette}>
        {@render heading('Palette', `This vault · ${vaultName}`)}
        <div class="group">
          <label class="label" for="vault-name">Vault name</label>
          <input
            id="vault-name"
            class="name"
            type="text"
            value={vaultName === folderName ? '' : vaultName}
            placeholder={folderName}
            spellcheck="false"
            onchange={(e) => onname(e.currentTarget.value)}
            onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <p class="hint">Shown in the title bar and on the welcome screen. The folder keeps its name.</p>
        </div>
        <div class="group">
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
          <p class="hint">Printed on {stock.name.toLowerCase()} paper. Other vaults keep their own palettes.</p>
        </div>
      </section>

      <section class="section" aria-label="Endpaper">
        {@render heading('Endpaper', `This vault · ${vaultName}`, 'This vault’s marbled sheet, from its palette: it shows on the welcome screen and behind the PDF')}
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
      </section>
    {/if}
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
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 16px;
  }
  .section {
    padding-bottom: 2px;
  }
  .section + .section {
    margin-top: 6px;
    border-top: 1px solid var(--line);
  }
  .section-title {
    margin: 0;
    padding: 10px 12px 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .scope {
    padding: 1px 12px 8px;
    font-size: 11.5px;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    font: 600 14px var(--f-ui);
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
  .name {
    width: 100%;
    box-sizing: border-box;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 13px var(--f-ui);
    color: var(--ink);
    cursor: pointer;
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
