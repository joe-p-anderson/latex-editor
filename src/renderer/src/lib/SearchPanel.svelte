<script lang="ts" module>
  export type Scope = 'file' | 'paper' | 'vault'
</script>

<script lang="ts">
  import { tick } from 'svelte'
  import type { SearchMatch, SearchOptions, SearchResult } from '@shared/search'

  /**
   * Find (and replace) in the open file, its multi-part paper or the whole
   * vault. Results are grouped by file; clicking one opens the file with the
   * match selected, and the open file's matches are highlighted in the editor.
   * Replacing leaves the changed files open and unsaved.
   */
  let {
    search,
    searchFile,
    version,
    active,
    visible,
    onopen,
    onreplace,
    onhighlight,
    onstep,
    onescape,
    paper = null,
  }: {
    search: (query: string, opts: SearchOptions) => Promise<SearchResult>
    /** Searches just the open file (its current text, saved or not). */
    searchFile: (query: string, opts: SearchOptions) => SearchResult
    /** Changes whenever files may have changed (a save, a replace), to search again. */
    version: number
    /** The open file, for the File scope. */
    active: string | null
    /** The panel is showing: its query is highlighted in the editor only then. */
    visible: boolean
    onopen: (rel: string, match: SearchMatch) => void
    /** Replace in these files (null: every file with results), or just `match` in the one file. */
    onreplace: (query: string, opts: SearchOptions, replacement: string, files: string[] | null, match?: SearchMatch) => Promise<void>
    /** The query to highlight in the editor (null: none). */
    onhighlight: (find: { query: string; opts: SearchOptions } | null) => void
    /** Enter / Shift+Enter: go to the next or previous match. */
    onstep: (dir: 1 | -1) => Promise<void>
    /** Escape: back to the editor. */
    onescape: () => void
    /** The open file's multi-part paper (its name and files in reading order), to search just it. */
    paper?: { name: string; files: string[] } | null
  } = $props()

  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  const folder = (p: string) => p.slice(0, p.lastIndexOf('/'))

  let chosen = $state<Scope>('vault')
  // Paper falls back to the vault when the open file isn't in one; File, when nothing's open.
  const scope = $derived<Scope>((chosen === 'paper' && !paper) || (chosen === 'file' && !active) ? 'vault' : chosen)
  const scopeName = $derived(scope === 'file' ? name(active ?? '') : scope === 'paper' ? (paper?.name ?? '') : 'the vault')
  const shown = $derived.by(() => {
    if (!result || scope !== 'paper' || !paper) return result
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
    const s = scope
    void version
    if (s === 'file') void active
    clearTimeout(timer)
    timer = setTimeout(() => run(q, o, s), q && s !== 'file' ? 200 : 0)
  })

  // The open file's matches are highlighted while the panel shows a query.
  $effect(() => {
    onhighlight(visible && query && !result?.error ? { query, opts: { ...opts } } : null)
  })

  async function run(q: string, o: SearchOptions, s: Scope): Promise<void> {
    const mine = ++seq
    if (!q) {
      result = null
      return
    }
    busy = true
    const r = await (s === 'file' ? Promise.resolve().then(() => searchFile(q, o)) : search(q, o)).catch((e: Error) => ({ files: [], truncated: false, error: e.message }))
    if (mine !== seq) return
    result = r
    busy = false
  }

  /** Focuses the query box, seeded with `text` (the editor's selection), searching in `to`, with the replace box shown if asked. */
  export async function focusWith(text: string, to?: Scope, replace = false): Promise<void> {
    if (text && !text.includes('\n')) query = text
    if (to) chosen = to
    if (replace) showReplace = true
    await tick()
    input?.focus()
    input?.select()
  }

  /** The first (dir 1) or last (-1) match of the file after or before `rel` among the results, wrapping round. */
  export function nextFile(rel: string | null, dir: 1 | -1): { rel: string; match: SearchMatch } | null {
    const files = shown?.files ?? []
    if (!files.length) return null
    const at = files.findIndex((f) => f.rel === rel)
    const f = files[at < 0 ? (dir > 0 ? 0 : files.length - 1) : (at + dir + files.length) % files.length]
    return { rel: f.rel, match: dir > 0 ? f.matches[0] : f.matches[f.matches.length - 1] }
  }

  /** Where the panel searches now. */
  export const currentScope = (): Scope => scope

  async function step(dir: 1 | -1): Promise<void> {
    await onstep(dir)
    input?.focus()
  }

  function onkey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onescape()
    }
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
    // Searching the file or the paper: replace in just its files.
    await onreplace(query, { ...opts }, replacement, files ?? (scope !== 'vault' ? shown.files.map((f) => f.rel) : null))
  }

</script>

<div class="panel">
  <div class="inputs">
    <div class="row">
      <button class="chev" title="Toggle replace" onclick={() => (showReplace = !showReplace)}>{showReplace ? '▾' : '▸'}</button>
      <div class="field">
        <input
          bind:this={input}
          bind:value={query}
          placeholder="Search {scopeName}"
          spellcheck="false"
          title="Enter: next match · Shift+Enter: previous · Esc: back to the text"
          onkeydown={onkey}
        />
        <span class="opts">
          <button class:on={opts.caseSensitive} title="Match case" onclick={() => toggle('caseSensitive')}>Aa</button>
          <button class:on={opts.wholeWord} title="Whole word" onclick={() => toggle('wholeWord')}><u>ab</u></button>
          <button class:on={opts.regex} title="Regular expression" onclick={() => toggle('regex')}>.*</button>
          <button class:on={opts.includeComments} title="Include % comments" onclick={() => toggle('includeComments')}>%</button>
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
            onkeydown={(e) => (e.key === 'Enter' && e.ctrlKey && e.altKey ? replaceAll(null) : e.key === 'Escape' && onescape())}
          />
          <span class="opts">
            <button disabled={!total} title="Replace all (Ctrl+Alt+Enter)" onclick={() => replaceAll(null)}>All</button>
          </span>
        </div>
      </div>
    {/if}
    <div class="row">
      <span class="chev-space"></span>
      <div class="scopes" role="radiogroup" aria-label="Search in">
        <button role="radio" aria-checked={scope === 'file'} class:on={scope === 'file'} disabled={!active} title="Just the open file (Ctrl+F)" onclick={() => (chosen = 'file')}>File</button>
        {#if paper}<button role="radio" aria-checked={scope === 'paper'} class:on={scope === 'paper'} title="{paper.name}'s files, in reading order" onclick={() => (chosen = 'paper')}>Paper</button>{/if}
        <button role="radio" aria-checked={scope === 'vault'} class:on={scope === 'vault'} title="Every file in the vault (Ctrl+Shift+H)" onclick={() => (chosen = 'vault')}>Vault</button>
      </div>
    </div>
  </div>

  <div class="summary">
    {#if result?.error}
      <span class="err">{result.error}</span>
    {:else if shown}
      {#if scope === 'file'}
        {total} result{total === 1 ? '' : 's'} in {scopeName}
      {:else}
        {total} result{total === 1 ? '' : 's'} in {shown.files.length} file{shown.files.length === 1 ? '' : 's'}{scope === 'paper' ? ` of ${paper?.name}` : ''}{shown.truncated ? ' (showing the first ones)' : ''}
      {/if}
      {#if busy}…{/if}
    {:else if busy}
      Searching…
    {/if}
  </div>

  <div class="results">
    {#each shown?.files ?? [] as f (f.rel)}
      <!-- One file needs no heading. -->
      <div class="file" hidden={scope === 'file'}>
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
      {#if scope === 'file' || !collapsed.has(f.rel)}
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
  .scopes {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .scopes button {
    border: none;
    border-radius: 0;
    background: none;
    padding: 1px 10px;
    font-size: 11px;
    color: var(--ink-soft);
  }
  .scopes button + button {
    border-left: 1px solid var(--line);
  }
  .scopes button.on {
    color: var(--detail);
    background: var(--sel);
  }
  .scopes button:disabled {
    opacity: 0.5;
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
  .file[hidden] {
    display: none;
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
