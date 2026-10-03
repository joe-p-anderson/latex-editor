<script lang="ts">
  /**
   * The Problems view: search and filter the bank, see each problem as it
   * will look, where it is used, and what it needs. Double-click a card (or
   * press Insert) to put it in the open document; tick the box to mark it
   * for a new assignment.
   */
  import type { PluginViewProps } from '../../../renderer/src/lib/plugins.svelte'
  import { needsSummary, previewBlocks, searchableText, usageLabel, type CheckResult, type Fragment } from '../bank'
  import { insertProblem } from './actions'
  import { bank, toggleMark } from './store.svelte'

  let { ctx, docKey }: PluginViewProps = $props()

  let query = $state('')
  let tag = $state('')
  let difficulty = $state(0)
  let limit = $state(40)
  let busy = $state(new Set<string>())
  let expanded = $state(new Set<string>())

  // Words to search in each problem, found once per version of its file.
  const haystacks = new Map<string, string>()
  const haystack = (f: Fragment) => {
    const key = `${f.id}@${f.mtime}`
    let h = haystacks.get(key)
    if (h === undefined) {
      h = [f.title, f.name, f.source, f.tags.join(' '), searchableText(f.body)].join(' ').toLowerCase()
      haystacks.set(key, h)
    }
    return h
  }

  const tags = $derived.by(() => {
    const counts = new Map<string, number>()
    for (const f of bank.fragments) for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]))
  })

  const shown = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return bank.fragments.filter((f) => (!tag || f.tags.includes(tag)) && (!difficulty || f.difficulty === difficulty) && words.every((w) => haystack(f).includes(w)))
  })

  // Math is drawn with the open document's macros; start again when it changes.
  const drawn = new Map<string, string>()
  $effect(() => {
    void docKey
    drawn.clear()
  })
  const draw = (tex: string, display: boolean): string => {
    const key = (display ? 'D' : 'I') + tex
    let svg = drawn.get(key)
    if (svg === undefined) {
      try {
        const r = ctx.editor.math()(tex, display)
        svg = r.error ? `<code class="bad">${escapeHtml(tex)}</code>` : r.svg
      } catch {
        svg = `<code class="bad">${escapeHtml(tex)}</code>`
      }
      drawn.set(key, svg)
    }
    return svg
  }
  const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

  async function check(f: Fragment) {
    busy = new Set(busy).add(f.id)
    try {
      bank.checks = { ...bank.checks, [f.id]: await ctx.invoke<CheckResult>('check', f.id) }
    } catch (e) {
      ctx.host.notify(`Check failed: ${(e as Error).message}`)
    } finally {
      const next = new Set(busy)
      next.delete(f.id)
      busy = next
    }
  }

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (!next.delete(id)) next.add(id)
    return next
  }
</script>

<div class="panel">
  <div class="head">
    <div class="title">Problems</div>
    <input class="search" type="search" placeholder="Search problems" bind:value={query} spellcheck="false" />
    <div class="filters">
      <select bind:value={tag} aria-label="Tag">
        <option value="">Any tag</option>
        {#each tags as [t, n] (t)}<option value={t}>{t} ({n})</option>{/each}
      </select>
      <select bind:value={difficulty} aria-label="Difficulty">
        <option value={0}>Any difficulty</option>
        {#each [1, 2, 3, 4, 5] as d (d)}<option value={d}>{'●'.repeat(d)}</option>{/each}
      </select>
    </div>
    {#if bank.marked.length}
      <div class="marked">
        {bank.marked.length} marked
        <button class="link" onclick={() => ctx.commands.run('new-assignment')}>New assignment</button>
        <button class="link" onclick={() => (bank.marked = [])}>Clear</button>
      </div>
    {/if}
  </div>

  <div class="body">
    {#if !bank.loaded}
      <p class="help">Reading the bank…</p>
    {:else if !bank.fragments.length}
      <p class="help">
        No problems yet. Put one problem per .tex file in <code>{bank.folder || 'the vault'}</code>, or put the cursor in a
        <code>\question</code> and run Tools, Problem bank, Add question to bank.
      </p>
    {:else if !shown.length}
      <p class="help">No problem matches.</p>
    {/if}

    {#each shown.slice(0, limit) as f (f.id)}
      {@const result = bank.checks[f.id]}
      <article class="card" class:marked={bank.marked.includes(f.id)} ondblclick={() => insertProblem(ctx, f)}>
        <header>
          <input type="checkbox" checked={bank.marked.includes(f.id)} onchange={() => toggleMark(f.id)} title="Mark for a new assignment" />
          <span class="name">{f.title}</span>
          {#if f.difficulty}<span class="dots" title="Difficulty {f.difficulty} of 5">{'●'.repeat(f.difficulty)}</span>{/if}
        </header>

        {#if f.tags.length}
          <div class="tags">
            {#each f.tags as t (t)}<button class="tag" class:on={tag === t} onclick={() => (tag = tag === t ? '' : t)}>{t}</button>{/each}
          </div>
        {/if}

        <div class="preview" class:open={expanded.has(f.id)}>
          {#each previewBlocks(f.body) as block, i (i)}
            <p class:part={block.label}>
              {#if block.label}<span class="label">{block.label}</span>{/if}
              {#each block.segs as s, k (k)}{#if s.t === 'text'}{s.s}{:else}<span class="math" class:display={s.display}>{@html draw(s.tex, s.display)}</span>{/if}{/each}
            </p>
          {/each}
        </div>
        <button class="link more" onclick={() => (expanded = toggle(expanded, f.id))}>{expanded.has(f.id) ? 'Less' : 'More'}</button>

        {#if f.needs.length || f.preamble.length}
          <div class="meta">needs {needsSummary(f)}</div>
        {/if}
        {#if f.source}<div class="meta">{f.source}</div>{/if}
        <div class="meta">
          {#if f.library}
            from the shared library
          {:else if f.usedIn.length}
            used in
            {#each f.usedIn as rel, i (rel)}{i ? ', ' : ' '}<button class="link" onclick={() => ctx.host.open(rel)} title={rel}>{usageLabel(rel)}</button>{/each}
          {:else}
            not used yet
          {/if}
        </div>

        <footer>
          <button onclick={() => insertProblem(ctx, f)}>Insert</button>
          <button onclick={() => check(f)} disabled={busy.has(f.id)}>{busy.has(f.id) ? 'Checking…' : 'Check'}</button>
          {#if !f.library}<button class="link" onclick={() => ctx.host.open(f.id)}>Open</button>{/if}
          {#if result}
            <span class="result" class:ok={result.ok} class:bad={!result.ok}>{result.ok ? 'Builds' : `${result.errors.length || 'Some'} problem${result.errors.length === 1 ? '' : 's'}`}</span>
          {/if}
        </footer>
        {#if result && !result.ok}
          <ul class="errors">
            {#each result.errors as e, i (i)}<li>{e.title}{e.line ? ` (line ${e.line})` : ''}</li>{/each}
          </ul>
        {/if}
      </article>
    {/each}

    {#if shown.length > limit}
      <button class="link showmore" onclick={() => (limit += 40)}>Show {Math.min(40, shown.length - limit)} more of {shown.length - limit}</button>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .head {
    padding: 8px 12px 6px;
  }
  .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
    margin-bottom: 6px;
  }
  .search {
    width: 100%;
    box-sizing: border-box;
  }
  .filters {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .filters select {
    flex: 1;
    min-width: 0;
  }
  .marked {
    margin-top: 6px;
    font-size: 12px;
    color: var(--ink-soft);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 12px 16px;
  }
  .help {
    font-size: 12px;
    color: var(--ink-soft);
  }
  .card {
    padding: 8px 0 10px;
    border-top: 1px solid var(--line);
  }
  .card.marked {
    background: var(--sel);
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .name {
    flex: 1;
    font-weight: 600;
    min-width: 0;
  }
  .dots {
    color: var(--detail);
    font-size: 9px;
    letter-spacing: 1px;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .tag {
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    border-radius: 9px;
    padding: 0 7px;
    font-size: 11px;
    cursor: pointer;
  }
  .tag.on {
    border-color: var(--detail);
    color: var(--detail);
  }
  .preview {
    margin-top: 6px;
    max-height: 7.5em;
    overflow: hidden;
    font-family: var(--f-page);
    font-size: 13px;
    line-height: 1.45;
    color: var(--ink);
  }
  .preview.open {
    max-height: none;
  }
  .preview p {
    margin: 0 0 4px;
  }
  .preview .part {
    padding-left: 14px;
    text-indent: -14px;
  }
  .label {
    display: inline-block;
    width: 14px;
    text-indent: 0;
    color: var(--ink-soft);
  }
  .math :global(svg) {
    vertical-align: middle;
    max-width: 100%;
  }
  .math.display {
    display: block;
    text-align: center;
    overflow-x: auto;
  }
  .math :global(.bad) {
    color: var(--err, #c0392b);
  }
  .meta {
    margin-top: 3px;
    font-size: 12px;
    color: var(--ink-soft);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .result {
    font-size: 12px;
  }
  .result.ok {
    color: var(--detail);
  }
  .result.bad {
    color: var(--err, #c0392b);
  }
  .errors {
    margin: 4px 0 0;
    padding-left: 16px;
    font-size: 12px;
    color: var(--err, #c0392b);
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--detail);
    cursor: pointer;
    font-size: 12px;
  }
  .more {
    margin-top: 2px;
  }
  .showmore {
    display: block;
    margin: 10px auto 0;
  }
</style>
