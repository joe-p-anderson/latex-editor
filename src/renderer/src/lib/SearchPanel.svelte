<script lang="ts">
  import { tick } from 'svelte'
  import type { SearchMatch, SearchOptions, SearchResult } from '@shared/search'

  /**
   * Search (and replace) across every text file in the vault. Results are
   * grouped by file; clicking one opens the file with the match selected.
   * Replacing leaves the changed files open and unsaved.
   */
  let {
    search,
    version,
    onopen,
    onreplace,
    paper = null,
  }: {
    search: (query: string, opts: SearchOptions) => Promise<SearchResult>
    /** Changes whenever files may have changed (a save, a replace), to search again. */
    version: number
    onopen: (rel: string, match: SearchMatch) => void
    /** Replace in these files (null: every file with results), or just `match` in the one file. */
    onreplace: (query: string, opts: SearchOptions, replacement: string, files: string[] | null, match?: SearchMatch) => Promise<void>
    /** The open file's multi-part paper (its name and files in reading order), to search just it. */
    paper?: { name: string; files: string[] } | null
  } = $props()

  // Just the paper: its files only, in reading order.
  let inPaper = $state(false)
  const scoped = $derived(inPaper && !!paper)
  const shown = $derived.by(() => {
    if (!result || !scoped || !paper) return result
    const order = new Map(paper.files.map((f, i) => [f, i]))
    const files = result.files.filter((f) => order.has(f.rel)).sort((a, b) => order.get(a.rel)! - order.get(b.rel)!)
    return { ...result, files }
  })

  let query = $state('')
  let replacement = $state('')
  let showReplace = $state(false)
  let opts = $state<SearchOptions>({ regex: false, caseSensitive: false, wholeWord: false, includeComments: false })
  let result = $state<SearchResult | null>(null)
  let busy = $state(false)
  let collapsed = $state(new Set<string>())
  let input = $state<HTMLInputElement>()

  const total = $derived(shown?.files.reduce((n, f) => n + f.matches.length, 0) ?? 0)

  // Search as you type (debounced), when an option changes, and after saves.
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0
  $effect(() => {
    const q = query
    const o = { ...opts }
    void version
    clearTimeout(timer)
    timer = setTimeout(() => run(q, o), q ? 200 : 0)
  })

  async function run(q: string, o: SearchOptions): Promise<void> {
    const mine = ++seq
    if (!q) {
      result = null
      return
    }
    busy = true
    const r = await search(q, o).catch((e: Error) => ({ files: [], truncated: false, error: e.message }))
    if (mine !== seq) return
    result = r
    busy = false
  }

  /** Focuses the query box, seeded with `text` when given (the editor's selection). */
  export async function focusWith(text: string): Promise<void> {
    if (text && !text.includes('\n')) query = text
    await tick()
    input?.focus()
    input?.select()
  }

  const toggle = (k: keyof SearchOptions) => (opts = { ...opts, [k]: !opts[k] })

  function toggleFile(rel: string): void {
    const next = new Set(collapsed)
    if (next.has(rel)) next.delete(rel)
    else next.add(rel)
    collapsed = next
  }

  async function replaceAll(files: string[] | null): Promise<void> {
    if (!shown?.files.length) return
    // Searching just the paper: replace in just its files.
    await onreplace(query, { ...opts }, replacement, files ?? (scoped ? shown.files.map((f) => f.rel) : null))
  }

  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  const folder = (p: string) => p.slice(0, p.lastIndexOf('/'))
</script>

<div class="panel">
  <div class="inputs">
    <div class="row">
      <button class="chev" title="Toggle replace" onclick={() => (showReplace = !showReplace)}>{showReplace ? '▾' : '▸'}</button>
      <div class="field">
        <input
          bind:this={input}
          bind:value={query}
          placeholder={scoped ? `Search ${paper?.name}` : 'Search the vault'}
          spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && run(query, { ...opts })}
        />
        <span class="opts">
          <button class:on={opts.caseSensitive} title="Match case" onclick={() => toggle('caseSensitive')}>Aa</button>
          <button class:on={opts.wholeWord} title="Whole word" onclick={() => toggle('wholeWord')}><u>ab</u></button>
          <button class:on={opts.regex} title="Regular expression" onclick={() => toggle('regex')}>.*</button>
          <button class:on={opts.includeComments} title="Include % comments" onclick={() => toggle('includeComments')}>%</button>
          {#if paper}<button class:on={inPaper} title="Just {paper.name}'s files, in reading order" onclick={() => (inPaper = !inPaper)}>§</button>{/if}
        </span>
      </div>
    </div>
    {#if showReplace}
      <div class="row">
        <span class="chev-space"></span>
        <div class="field">
          <input
            bind:value={replacement}
            placeholder={opts.regex ? 'Replace ($1 for groups)' : 'Replace'}
            spellcheck="false"
            onkeydown={(e) => e.key === 'Enter' && e.ctrlKey && e.altKey && replaceAll(null)}
          />
          <span class="opts">
            <button disabled={!total} title="Replace all (Ctrl+Alt+Enter)" onclick={() => replaceAll(null)}>All</button>
          </span>
        </div>
      </div>
    {/if}
  </div>

  <div class="summary">
    {#if result?.error}
      <span class="err">{result.error}</span>
    {:else if shown}
      {total} result{total === 1 ? '' : 's'} in {shown.files.length} file{shown.files.length === 1 ? '' : 's'}{scoped ? ` of ${paper?.name}` : ''}{shown.truncated ? ' (showing the first ones)' : ''}
      {#if busy}…{/if}
    {:else if busy}
      Searching…
    {/if}
  </div>

  <div class="results">
    {#each shown?.files ?? [] as f (f.rel)}
      <div class="file">
        <button class="file-row" onclick={() => toggleFile(f.rel)} title={f.rel}>
          <span class="tri">{collapsed.has(f.rel) ? '▸' : '▾'}</span>
          <span class="name">{name(f.rel)}</span>
          <span class="dir">{folder(f.rel)}</span>
          <span class="count">{f.matches.length}</span>
        </button>
        {#if showReplace}
          <button class="act" title="Replace all in this file" onclick={() => replaceAll([f.rel])}>↺</button>
        {/if}
      </div>
      {#if !collapsed.has(f.rel)}
        {#each f.matches as m (m.from)}
          <div class="match">
            <button class="match-row" onclick={() => onopen(f.rel, m)} title="Line {m.line}">
              <span class="ln">{m.line}</span>
              <span class="pre">{m.before}<mark class:strike={showReplace}>{m.text}</mark>{#if showReplace}<ins>{replacement}</ins>{/if}{m.after}</span>
            </button>
            {#if showReplace}
              <button class="act" title="Replace" onclick={() => onreplace(query, { ...opts }, replacement, [f.rel], m)}>↺</button>
            {/if}
          </div>
        {/each}
      {/if}
    {/each}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .inputs {
    padding: 8px 8px 4px 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .chev,
  .chev-space {
    width: 18px;
    flex: none;
  }
  .chev {
    border: none;
    background: none;
    padding: 0;
    color: var(--ink-soft);
  }
  .field {
    flex: 1;
    display: flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    min-width: 0;
  }
  .field:focus-within {
    border-color: var(--detail);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    font: inherit;
    padding: 4px 6px;
    background: none;
  }
  .opts {
    display: flex;
    gap: 1px;
    padding-right: 2px;
  }
  .opts button {
    border: 1px solid transparent;
    background: none;
    padding: 0 4px;
    font-size: 11px;
    line-height: 18px;
    color: var(--ink-soft);
    font-family: Consolas, monospace;
  }
  .opts button.on {
    color: var(--detail);
    border-color: var(--detail);
    background: var(--sel);
  }
  .summary {
    padding: 2px 10px 6px;
    color: var(--ink-soft);
    font-size: 12px;
    min-height: 20px;
  }
  .summary .err {
    color: var(--err);
  }
  .results {
    flex: 1;
    overflow: auto;
    min-height: 0;
    padding-bottom: 8px;
  }
  .file,
  .match {
    display: flex;
    align-items: center;
  }
  .file:hover,
  .match:hover {
    background: var(--sel);
  }
  .file-row,
  .match-row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    border: none;
    border-radius: 0;
    background: none;
    text-align: left;
    padding: 2px 6px;
    white-space: nowrap;
  }
  .file-row:hover,
  .match-row:hover {
    background: none;
  }
  .tri {
    color: var(--ink-soft);
    width: 10px;
  }
  .name {
    font-weight: 600;
  }
  .dir {
    color: var(--ink-soft);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .count {
    color: var(--ink-soft);
    font-size: 11px;
    background: var(--line);
    border-radius: 8px;
    padding: 0 6px;
  }
  .match-row {
    padding-left: 22px;
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 12px;
  }
  .ln {
    color: var(--ink-soft);
    min-width: 2.5em;
    text-align: right;
  }
  .pre {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  mark {
    background: var(--hl);
    color: inherit;
    border-radius: 2px;
  }
  mark.strike {
    background: var(--del);
    text-decoration: line-through;
  }
  ins {
    background: var(--ins);
    text-decoration: none;
    border-radius: 2px;
  }
  .act {
    border: none;
    background: none;
    padding: 0 6px;
    visibility: hidden;
  }
  .file:hover .act,
  .match:hover .act {
    visibility: visible;
  }
</style>
