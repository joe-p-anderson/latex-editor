<script lang="ts">
  /**
   * The Citations tool: the open document's bibliography as cards. Click to
   * cite at the cursor; the key opens the entry in its .bib file.
   */
  import type { BibInfo } from '@shared/api'
  import type { BibSummary } from '@shared/bibtex'

  let {
    bib,
    oncite,
    onopen,
  }: {
    /** Null when no document (or its bibliography) is loaded. */
    bib: BibInfo | null
    oncite: (key: string) => void
    onopen: (file: string, line: number) => void
  } = $props()

  let query = $state('')

  const matches = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const hay = (e: BibSummary) => `${e.key} ${e.authors} ${e.year} ${e.title} ${e.venue} ${e.tags.join(' ')}`.toLowerCase()
    return (bib?.entries ?? []).filter((e) => words.every((w) => hay(e).includes(w)))
  })
</script>

<div class="view">
  <div class="head">Citations</div>
  {#if !bib}
    <p class="hint">Open a document that has a bibliography to cite from it.</p>
  {:else if !bib.entries.length}
    <p class="hint">{bib.bibs.length ? `${bib.bibs.join(', ')} has no entries yet.` : 'This document names no bibliography.'}</p>
  {:else}
    <input class="field" bind:value={query} placeholder="Author, year, title or key" aria-label="Filter the bibliography" />
    <div class="list">
      {#each matches as e (e.key)}
        <button class="card" onclick={() => oncite(e.key)} title="Cite at the cursor">
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <span
            class="key"
            title="Open in {e.file}"
            onclick={(ev) => {
              ev.stopPropagation()
              onopen(e.file, e.line)
            }}>{e.key}</span
          >
          <span class="who">{e.author}{e.year ? ` (${e.year})` : ''}</span>
          <span class="title">{e.title}</span>
        </button>
      {:else}
        <p class="hint">Nothing matches.</p>
      {/each}
    </div>
  {/if}
</div>

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
  .key {
    display: block;
    font: 600 12px var(--f-mono);
    color: var(--detail);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .key:hover {
    text-decoration: underline;
  }
  .who {
    display: block;
    color: var(--ink-soft);
  }
  .hint {
    margin: 2px 12px 8px;
    font: italic 13.5px/1.4 var(--f-page);
    color: var(--ink-soft);
  }
</style>
