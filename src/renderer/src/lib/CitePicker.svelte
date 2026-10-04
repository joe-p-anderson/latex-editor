<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { searchBib, type BibSummary } from '@shared/bibtex'
  import type { BibInfo } from '@shared/api'
  import type { CiteHit, CiteSource } from './plugins.svelte'

  /**
   * A searchable list of the document's bibliography entries and, while
   * searching, of plugins' sources (e.g. Zotero), dimmed because inserting
   * one adds it to the .bib first. Click or Enter inserts one; Tab or the
   * checkbox marks several for Enter. Right-click for more.
   */
  let {
    info,
    sources = [],
    onpick,
    onsource,
    onshow,
    onclose,
  }: {
    info: BibInfo
    /** Plugins' reference sources, searched as you type, after the document's own entries. */
    sources?: CiteSource[]
    /** Cites entries of the bibliography. */
    onpick: (keys: string[]) => void
    /** A source's hit: add it to the bibliography, and cite it unless `cite` is false. */
    onsource: (source: CiteSource, hit: CiteHit, cite: boolean) => void
    /** Opens an entry where it is in its .bib. */
    onshow: (file: string, line: number) => void
    onclose: () => void
  } = $props()

  const LIMIT = 200

  type Row = { kind: 'bib'; entry: BibSummary } | { kind: 'source'; source: CiteSource; hit: CiteHit }

  let query = $state('')
  let selected = $state(0)
  let marked = $state<string[]>([])
  let input: HTMLInputElement
  let list: HTMLDivElement

  // No search: what the document already cites (in citation order), then the rest by author.
  const byDefault = $derived.by(() => {
    const n = (k: string) => Number(info.labels[k])
    const cited = info.entries.filter((e) => info.labels[e.key]).sort((a, b) => n(a.key) - n(b.key) || a.key.localeCompare(b.key))
    const rest = info.entries.filter((e) => !info.labels[e.key]).sort((a, b) => a.author.localeCompare(b.author) || a.year.localeCompare(b.year))
    return [...cited, ...rest]
  })
  const results = $derived(query.trim() ? searchBib(info.entries, query) : byDefault)

  // The sources' hits for the query, once typing pauses; ones already in the bibliography are left out.
  let external = $state<{ source: CiteSource; hits: CiteHit[] }[]>([])
  let externalTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const q = query.trim()
    clearTimeout(externalTimer)
    if (q.length < 2 || !sources.length) {
      external = []
      return
    }
    const known = new Set(info.entries.map((e) => e.key))
    externalTimer = setTimeout(async () => {
      const found = await Promise.all(
        sources.map(async (source) => ({ source, hits: (await source.search(q).catch(() => [])).filter((h) => !h.key || !known.has(h.key)) })),
      )
      if (query.trim() === q) external = found.filter((f) => f.hits.length)
    }, 250)
  })

  const rows = $derived<Row[]>([
    ...results.slice(0, LIMIT).map((entry): Row => ({ kind: 'bib', entry })),
    ...external.flatMap(({ source, hits }) => hits.map((hit): Row => ({ kind: 'source', source, hit }))),
  ])
  $effect(() => {
    void query
    selected = 0
  })

  onMount(() => input.focus())

  function toggle(key: string): void {
    marked = marked.includes(key) ? marked.filter((k) => k !== key) : [...marked, key]
  }

  /** Inserts one row: a bibliography entry is cited; a source's hit is added to the .bib, then cited. */
  function insertRow(row: Row): void {
    if (row.kind === 'bib') onpick([row.entry.key])
    else onsource(row.source, row.hit, true)
  }

  function onkeydown(e: KeyboardEvent): void {
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[e.key]
    if (menu && e.key === 'Escape') {
      e.preventDefault()
      menu = null
    } else if (move) {
      e.preventDefault()
      selected = Math.max(0, Math.min(rows.length - 1, selected + move))
      list.querySelectorAll('.row')[selected]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Tab' && rows[selected]?.kind === 'bib') {
      e.preventDefault()
      toggle((rows[selected] as { entry: BibSummary }).entry.key)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (marked.length) onpick(marked)
      else if (rows[selected]) insertRow(rows[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }

  function addTag(tag: string): void {
    const word = `#${tag.toLowerCase().replace(/\s+/g, '-')}`
    const parts = query.split(/\s+/).filter(Boolean)
    if (!parts.includes(word)) query = [...parts, word].join(' ')
    input.focus()
  }

  // --- Right-click menu ---------------------------------------------------------

  let menu = $state<{ row: Row; x: number; y: number } | null>(null)
  async function openMenu(e: MouseEvent, row: Row, i: number): Promise<void> {
    e.preventDefault()
    selected = i
    menu = { row, x: e.clientX, y: e.clientY }
    await tick()
    // Keep it on screen.
    const el = document.querySelector<HTMLElement>('.cite-menu')
    if (el && menu) {
      const r = el.getBoundingClientRect()
      menu = { ...menu, x: Math.min(menu.x, innerWidth - r.width - 4), y: Math.min(menu.y, innerHeight - r.height - 4) }
    }
  }
  // The action first: the menu's {@const row} reads `menu`, so closing it first would leave it null.
  const run = (f: () => void) => () => {
    f()
    menu = null
  }
  const keyOf = (row: Row) => (row.kind === 'bib' ? row.entry.key : row.hit.key)
  const fileName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)
</script>

{#snippet who(author: string, year: string | undefined)}
  <span class="who">{author || '(no author)'}{year ? ` ${year}` : ''}</span>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => (e.stopPropagation(), (menu = null))} {onkeydown} role="dialog" aria-label="Cite" tabindex="-1">
    <div class="top">
      <strong>Cite</strong>
      <input bind:this={input} bind:value={query} placeholder="Search {info.entries.length} references: author, title, year, journal, #tag…" spellcheck="false" />
      <span class="hint">↵ insert · tab mark · right-click for more · esc close</span>
    </div>
    {#if marked.length}
      <div class="marked">
        {#each marked as key (key)}
          <button class="pill" onclick={() => toggle(key)} title="Unmark">{key} ×</button>
        {/each}
        <span class="spacer"></span>
        <button onclick={() => onpick(marked)}>Insert {marked.length}</button>
      </div>
    {/if}
    <div class="list" bind:this={list}>
      {#each rows as row, i (row.kind === 'bib' ? `b:${row.entry.key}` : `s:${i}`)}
        {#if row.kind === 'source' && (i === 0 || rows[i - 1].kind === 'bib' || (rows[i - 1] as { source: CiteSource }).source !== row.source)}
          <div class="source">From {row.source.label}: not in the bibliography yet. Inserting one adds it.</div>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="row"
          class:sel={i === selected}
          class:faint={row.kind === 'source'}
          class:marked={row.kind === 'bib' && marked.includes(row.entry.key)}
          role="option"
          aria-selected={i === selected}
          tabindex="-1"
          title={row.kind === 'source' ? `Not in the bibliography yet: inserting it adds it from ${row.source.label}` : undefined}
          onclick={() => insertRow(row)}
          oncontextmenu={(ev) => openMenu(ev, row, i)}
          onmouseenter={() => (selected = i)}
        >
          {#if row.kind === 'bib'}
            {@const e = row.entry}
            {@const label = info.labels[e.key]}
            <input type="checkbox" checked={marked.includes(e.key)} onclick={(ev) => (ev.stopPropagation(), toggle(e.key))} title="Mark to cite several at once" />
            <div class="body">
              <div class="line1">
                {@render who(e.author, e.year)}
                {#if label}<span class="num" title="Already cited: [{label}]">[{label}]</span>{/if}
                <span class="key">{e.key}</span>
              </div>
              <div class="title">{e.title || '(untitled)'}</div>
              {#if e.venue || e.tags.length}
                <div class="line3">
                  {#if e.venue}<span class="venue">{e.venue}</span>{/if}
                  {#each e.tags.slice(0, 6) as tag (tag)}
                    <button class="tag" onclick={(ev) => (ev.stopPropagation(), addTag(tag))} title="Show only entries tagged {tag}">{tag}</button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            {@const h = row.hit}
            <span class="box-space"></span>
            <div class="body">
              <div class="line1">
                {@render who(h.authors, h.year)}
                {#if h.key}<span class="key">{h.key}</span>{/if}
              </div>
              <div class="title">{h.title || '(untitled)'}</div>
              {#if h.detail}<div class="line3"><span class="venue">{h.detail}</span></div>{/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="empty">
          {#if info.entries.length}No references match "{query}".{:else if info.missing.length}Couldn't find {info.missing.map((m) => `${m}.bib`).join(', ')}.{:else}This document has no \bibliography{'{…}'} or \addbibresource{'{…}'}.{/if}
        </p>
      {/each}
      {#if results.length > LIMIT}<p class="empty">…and {results.length - LIMIT} more. Type to narrow the list.</p>{/if}
    </div>
  </div>
</div>

{#if menu}
  {@const row = menu.row}
  {@const key = keyOf(row)}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="cite-menu" style:left="{menu.x}px" style:top="{menu.y}px" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="menu-head">
      {#if row.kind === 'bib'}{@render who(row.entry.author, row.entry.year)}{:else}{@render who(row.hit.authors, row.hit.year)}{/if}
      <div class="muted">{row.kind === 'bib' ? `In ${fileName(row.entry.file)}` : `In ${row.source.label}, not in the bibliography yet`}</div>
    </div>
    <button onclick={run(() => insertRow(row))}>Insert <code>\cite{'{'}{key ?? '…'}{'}'}</code>{#if row.kind === 'source'}, adding it to the bibliography{/if}</button>
    {#if row.kind === 'bib'}
      <button onclick={run(() => onshow(row.entry.file, row.entry.line))}>Show in {fileName(row.entry.file)}</button>
    {:else}
      <button onclick={run(() => onsource(row.source, row.hit, false))}>Add to the bibliography</button>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 8vh;
    z-index: 100;
  }
  .dialog {
    width: min(820px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .top input {
    flex: 1;
    font: inherit;
    font-size: 14px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 5px;
    outline-color: var(--detail);
  }
  .hint {
    color: var(--ink-soft);
    font-size: 12px;
    white-space: nowrap;
  }
  .marked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--side);
  }
  .pill {
    font-family: Consolas, monospace;
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 9px;
  }
  .spacer {
    flex: 1;
  }
  .list {
    overflow: auto;
    padding: 6px;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 7px 10px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .row.sel {
    border-color: var(--detail);
    background: var(--sel);
  }
  .row.marked:not(.sel) {
    background: var(--side);
  }
  .row input {
    margin-top: 3px;
  }
  .body {
    min-width: 0;
    flex: 1;
  }
  .line1 {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .who {
    font-weight: 500;
  }
  .num {
    color: var(--detail);
    font-size: 12px;
  }
  .key {
    margin-left: auto;
    font-family: Consolas, monospace;
    font-size: 11px;
    color: var(--ink-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50%;
  }
  .title {
    font-weight: 600;
    margin: 1px 0;
  }
  .line3 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
  }
  .venue {
    color: var(--ink-soft);
    font-style: italic;
    margin-right: 4px;
  }
  .tag {
    font-size: 11px;
    padding: 0 7px;
    border-radius: 9px;
    border: none;
    color: var(--ink-soft);
    background: var(--sel);
  }
  .tag:hover {
    color: var(--detail);
  }
  .empty {
    color: var(--ink-soft);
    text-align: center;
  }
  .source {
    margin: 10px 10px 4px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-soft);
  }
  /* Like Symbols' symbols whose package isn't loaded: there, but not ready to use as is. */
  .row.faint {
    opacity: 0.5;
  }
  .row.faint.sel,
  .row.faint:hover {
    opacity: 0.85;
  }
  .box-space {
    width: 13px;
    flex: none;
  }
  .cite-menu {
    position: fixed;
    z-index: 200;
    min-width: 240px;
    max-width: 380px;
    padding: 4px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
  }
  .menu-head {
    padding: 6px 10px 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }
  .muted {
    font-size: 12px;
    color: var(--ink-soft);
  }
  .cite-menu button {
    border: none;
    background: none;
    text-align: left;
    padding: 5px 10px;
    border-radius: 4px;
  }
  .cite-menu button:hover {
    background: var(--sel);
  }
  .cite-menu code {
    font-family: Consolas, monospace;
    font-size: 12px;
  }
</style>
