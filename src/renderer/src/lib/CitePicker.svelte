<script lang="ts">
  import { onMount } from 'svelte'
  import { searchBib, type BibSummary } from '@shared/bibtex'
  import type { BibInfo } from '@shared/api'

  /**
   * A searchable list of the document's bibliography entries. Enter inserts
   * the selected entry, or every marked one (Tab or Ctrl+click marks).
   */
  let {
    info,
    onpick,
    onclose,
  }: {
    info: BibInfo
    onpick: (keys: string[]) => void
    onclose: () => void
  } = $props()

  const LIMIT = 200

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
  const shown = $derived(results.slice(0, LIMIT))
  $effect(() => {
    void query
    selected = 0
  })

  onMount(() => input.focus())

  function toggle(key: string): void {
    marked = marked.includes(key) ? marked.filter((k) => k !== key) : [...marked, key]
  }

  function insert(): void {
    const keys = marked.length ? marked : shown[selected] ? [shown[selected].key] : []
    if (keys.length) onpick(keys)
  }

  function addTag(tag: string): void {
    const word = `#${tag.toLowerCase().replace(/\s+/g, '-')}`
    const parts = query.split(/\s+/).filter(Boolean)
    if (!parts.includes(word)) query = [...parts, word].join(' ')
    input.focus()
  }

  function onkeydown(e: KeyboardEvent): void {
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[e.key]
    if (move) {
      e.preventDefault()
      selected = Math.max(0, Math.min(shown.length - 1, selected + move))
      list.querySelectorAll('.row')[selected]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Tab' && shown[selected]) {
      e.preventDefault()
      toggle(shown[selected].key)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      insert()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }

  function click(e: MouseEvent, entry: BibSummary, i: number): void {
    if (e.ctrlKey || e.metaKey) toggle(entry.key)
    else {
      selected = i
      if (!marked.length) onpick([entry.key])
      else insert()
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="Cite" tabindex="-1">
    <div class="top">
      <strong>Cite</strong>
      <input bind:this={input} bind:value={query} placeholder="Search {info.entries.length} references: author, title, year, journal, #tag…" spellcheck="false" />
      <span class="hint">↵ insert · tab mark · esc close</span>
    </div>
    {#if marked.length}
      <div class="marked">
        {#each marked as key (key)}
          <button class="pill" onclick={() => toggle(key)} title="Unmark">{key} ×</button>
        {/each}
        <span class="spacer"></span>
        <button onclick={insert}>Insert {marked.length}</button>
      </div>
    {/if}
    <div class="list" bind:this={list}>
      {#each shown as e, i (e.key)}
        {@const label = info.labels[e.key]}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" class:sel={i === selected} class:marked={marked.includes(e.key)} role="option" aria-selected={i === selected} tabindex="-1" onclick={(ev) => click(ev, e, i)} onmouseenter={() => (selected = i)}>
          <input type="checkbox" checked={marked.includes(e.key)} onclick={(ev) => (ev.stopPropagation(), toggle(e.key))} title="Mark to cite several at once" />
          <div class="body">
            <div class="line1">
              <span class="who">{e.author || '(no author)'}{e.year ? ` ${e.year}` : ''}</span>
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
    background: var(--bg);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .top input {
    flex: 1;
    font: inherit;
    font-size: 14px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 5px;
    outline-color: var(--accent);
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .marked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
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
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .row.marked:not(.sel) {
    background: var(--panel);
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
    color: #8250df;
    font-size: 12px;
  }
  .key {
    margin-left: auto;
    font-family: Consolas, monospace;
    font-size: 11px;
    color: var(--muted);
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
    color: var(--muted);
    font-style: italic;
    margin-right: 4px;
  }
  .tag {
    font-size: 11px;
    padding: 0 7px;
    border-radius: 9px;
    border: none;
    color: var(--muted);
    background: rgba(110, 119, 129, 0.12);
  }
  .tag:hover {
    color: var(--accent);
  }
  .empty {
    color: var(--muted);
    text-align: center;
  }
</style>
