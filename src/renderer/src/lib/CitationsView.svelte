<script lang="ts">
  /**
   * The Citations tool: the open document's bibliography as cards and,
   * while filtering, plugins' sources (e.g. Zotero), dimmed because citing
   * one adds it to the .bib first. Click a card to cite it at the cursor;
   * right-click for more (show it in its .bib, or add it without citing).
   */
  import type { BibInfo } from '@shared/api'
  import type { BibSummary } from '@shared/bibtex'
  import type { CiteHit, CiteSource } from './plugins.svelte'
  import { citeMenu, searchSources, type CiteRow } from './citations'
  import CiteMenu from './CiteMenu.svelte'

  let {
    bib,
    sources = [],
    oncite,
    onsource,
    onopen,
  }: {
    /** Null when no document (or its bibliography) is loaded. */
    bib: BibInfo | null
    /** Plugins' reference sources, searched as you filter. */
    sources?: CiteSource[]
    oncite: (key: string) => void
    /** A source's hit: add it to the bibliography, and cite it unless `cite` is false. */
    onsource: (source: CiteSource, hit: CiteHit, cite: boolean) => void
    onopen: (file: string, line: number) => void
  } = $props()

  let query = $state('')

  const matches = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const hay = (e: BibSummary) => `${e.key} ${e.authors} ${e.year} ${e.title} ${e.venue} ${e.tags.join(' ')}`.toLowerCase()
    return (bib?.entries ?? []).filter((e) => words.every((w) => hay(e).includes(w)))
  })

  // The sources' hits for the filter, once typing pauses.
  let external = $state<CiteRow[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const q = query
    clearTimeout(timer)
    if (q.trim().length < 2) {
      external = []
      return
    }
    timer = setTimeout(async () => {
      const found = await searchSources(sources, q, bib)
      if (query === q) external = found
    }, 300)
  })

  const rows = $derived<CiteRow[]>([...matches.map((entry): CiteRow => ({ kind: 'bib', entry })), ...external])

  function cite(row: CiteRow): void {
    if (row.kind === 'bib') oncite(row.entry.key)
    else onsource(row.source, row.hit, true)
  }

  let menu = $state<{ row: CiteRow; x: number; y: number } | null>(null)
  function openMenu(e: MouseEvent, row: CiteRow): void {
    e.preventDefault()
    menu = { row, x: e.clientX, y: e.clientY }
  }
</script>

<div class="view">
  <div class="head">Citations</div>
  {#if !bib}
    <p class="hint">Open a document that has a bibliography to cite from it.</p>
  {:else}
    {#if bib.entries.length || sources.length}
      <input
        class="field"
        bind:value={query}
        placeholder={sources.length ? `Author, year, title or key; also searches ${sources.map((s) => s.label).join(', ')}` : 'Author, year, title or key'}
        aria-label="Filter the bibliography"
      />
    {/if}
    {#if !bib.entries.length}
      <p class="hint">{bib.bibs.length ? `${bib.bibs.join(', ')} has no entries yet.` : 'This document names no bibliography.'}</p>
    {/if}
    <div class="list">
      {#each rows as row, i (row.kind === 'bib' ? `b:${row.entry.key}` : `s:${i}`)}
        {#if row.kind === 'source' && (i === 0 || rows[i - 1].kind === 'bib' || (rows[i - 1] as { source: CiteSource }).source !== row.source)}
          <div class="source">From {row.source.label}: not in the bibliography yet</div>
        {/if}
        {#if row.kind === 'bib'}
          {@const e = row.entry}
          <button class="card" onclick={() => cite(row)} oncontextmenu={(ev) => openMenu(ev, row)} title="Cite at the cursor. Right-click for more">
            <span class="key">{e.key}</span>
            <span class="who">{e.author}{e.year ? ` (${e.year})` : ''}</span>
            <span class="title">{e.title}</span>
          </button>
        {:else}
          {@const h = row.hit}
          <button
            class="card faint"
            onclick={() => cite(row)}
            oncontextmenu={(ev) => openMenu(ev, row)}
            title="Not in the bibliography yet: citing it adds it from {row.source.label}. Right-click for more"
          >
            {#if h.key}<span class="key">{h.key}</span>{/if}
            <span class="who">{h.authors}{h.year ? ` (${h.year})` : ''}</span>
            <span class="title">{h.title}</span>
          </button>
        {/if}
      {:else}
        {#if bib.entries.length}<p class="hint">Nothing matches.</p>{/if}
      {/each}
    </div>
  {/if}
</div>

{#if menu}
  {@const row = menu.row}
  {@const m = citeMenu(row, { insert: () => cite(row), show: onopen, add: () => row.kind === 'source' && onsource(row.source, row.hit, false) })}
  <CiteMenu x={menu.x} y={menu.y} who={m.who} where={m.where} items={m.items} onclose={() => (menu = null)} />
{/if}

<style>
  .view {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .head {
    flex: none;
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font: 600 14px var(--f-page);
    letter-spacing: 0.12em;
    font-variant-caps: all-small-caps;
    color: var(--ink-soft);
  }
  .field {
    margin: 0 12px 6px;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    font: 13px var(--f-ui);
    outline: none;
  }
  .field:focus {
    border-color: var(--detail);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: hidden auto;
    padding-bottom: 8px;
  }
  .card {
    display: block;
    width: calc(100% - 24px);
    margin: 6px 12px;
    padding: 7px 10px;
    border: 1px solid var(--line);
    background: var(--paper);
    text-align: left;
    font: 13px/1.4 var(--f-page);
  }
  .card:hover:not(:disabled) {
    background: var(--paper);
    border-color: var(--detail);
  }
  /* Like Symbols' symbols whose package isn't loaded: there, but not ready to use as is. */
  .card.faint {
    opacity: 0.5;
  }
  .card.faint:hover {
    opacity: 0.85;
  }
  .key {
    display: block;
    font: 600 12px var(--f-mono);
    color: var(--detail);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who {
    display: block;
    color: var(--ink-soft);
  }
  .source {
    margin: 12px 12px 2px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font: 12px var(--f-ui);
    color: var(--ink-soft);
  }
  .hint {
    margin: 2px 12px 8px;
    font: italic 13.5px/1.4 var(--f-page);
    color: var(--ink-soft);
  }
</style>
