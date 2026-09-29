<script lang="ts">
  import { untrack } from 'svelte'
  import type { CompileResult, Problem, QuickFix, Severity } from '@shared/api'

  let {
    result,
    onjump,
    onfix,
  }: {
    result: CompileResult
    onjump: (p: Problem) => void
    onfix: (fix: QuickFix) => void
  } = $props()

  type Tab = Severity | 'log'
  let tab = $state<Tab>('error')
  let open = $state(false)
  let showHidden = $state(false)
  let expanded = $state(new Set<Problem>())

  const visible = $derived(result.problems.filter((p) => showHidden || !p.hidden))
  const count = (s: Severity) => visible.filter((p) => p.severity === s).length
  const hiddenCount = $derived(result.problems.filter((p) => p.hidden).length)
  const list = $derived(tab === 'log' ? [] : visible.filter((p) => p.severity === tab))

  // After each compile: open on errors, expanding the headline one; otherwise
  // stay as the user left it, but land on a tab that has something.
  // Only `result` is tracked: switching tabs must not re-run this.
  $effect(() => {
    const r = result
    untrack(() => {
      const errors = r.problems.filter((p) => p.severity === 'error' && !p.hidden)
      if (errors.length) {
        tab = 'error'
        open = true
        expanded = new Set(errors.filter((p) => !p.followOn).slice(0, 1))
      } else {
        expanded = new Set()
        if (tab === 'error') tab = count('warning') ? 'warning' : 'layout'
      }
    })
  })

  function toggle(p: Problem): void {
    if (expanded.has(p)) expanded.delete(p)
    else expanded.add(p)
    expanded = new Set(expanded)
  }

  const where = (p: Problem) => (p.file ? `${p.file.split(/[\\/]/).pop()}${p.line ? `:${p.line}` : ''}` : '')
  const icon: Record<Severity, string> = { error: '●', warning: '▲', layout: '◇' }
</script>

<section class="panel" class:open>
  <div class="bar">
    <button class="toggle" onclick={() => (open = !open)} title={open ? 'Hide problems' : 'Show problems'}>{open ? '▾' : '▸'}</button>
    {#each [['error', 'Errors'], ['warning', 'Warnings'], ['layout', 'Layout']] as [key, label] (key)}
      <button
        class="tab {key}"
        class:active={open && tab === key}
        onclick={() => ((tab = key as Tab), (open = true))}
      >
        {label} <span class="n" class:hot={count(key as Severity) > 0}>{count(key as Severity)}</span>
      </button>
    {/each}
    <button class="tab" class:active={open && tab === 'log'} onclick={() => ((tab = 'log'), (open = true))}>Raw log</button>
    <span class="spacer"></span>
    {#if hiddenCount}
      <label class="hidden-toggle" title="Font substitutions, rerun notices and other routine messages">
        <input type="checkbox" bind:checked={showHidden} /> Show {hiddenCount} routine
      </label>
    {/if}
  </div>

  {#if open}
    <div class="body">
      {#if tab === 'log'}
        <pre class="log">{result.log}</pre>
      {:else if list.length === 0}
        <p class="empty">No {tab === 'layout' ? 'layout notes' : `${tab}s`}.</p>
      {:else}
        <ul>
          {#each list as p, i (i)}
            <li class="item {p.severity}" class:follow={p.followOn}>
              <div class="head">
                <button class="chev" onclick={() => toggle(p)} aria-label="Details">{expanded.has(p) ? '▾' : '▸'}</button>
                <span class="icon">{icon[p.severity]}</span>
                <button class="title" onclick={() => toggle(p)}>{p.title}</button>
                {#if p.followOn}<span class="tag" title="Probably caused by an earlier error; fixing that may clear this">follow-on</span>{/if}
                {#if where(p)}<button class="loc" onclick={() => onjump(p)} title="Go to {p.file}">{where(p)}</button>{/if}
              </div>
              {#if expanded.has(p)}
                <div class="detail">
                  {#if p.explanation}<p>{p.explanation}</p>{/if}
                  {#if p.related?.length}
                    <p class="related">
                      {#each p.related as r (r.line)}
                        <button class="loc" onclick={() => onjump({ ...p, file: r.file, line: r.line })}>{r.label} (line {r.line})</button>
                      {/each}
                    </p>
                  {/if}
                  {#if p.fixes.length}
                    <div class="fixes">
                      {#each p.fixes as f (f.label)}
                        <button class="fix" onclick={() => onfix(f)}>{f.label}</button>
                      {/each}
                    </div>
                  {/if}
                  {#if p.tex}
                    <details>
                      <summary>What TeX said</summary>
                      <pre>{p.tex}</pre>
                    </details>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .panel {
    border-top: 1px solid var(--border);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .panel.open {
    height: 38%;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
  }
  .bar button {
    border: none;
    background: none;
    border-radius: 4px;
    padding: 3px 8px;
  }
  .bar button:hover {
    background: var(--accent-soft);
  }
  .toggle {
    color: var(--muted);
  }
  .tab.active {
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--border);
  }
  .n {
    display: inline-block;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--border);
    font-size: 11px;
    text-align: center;
  }
  .tab.error .n.hot {
    background: var(--err);
    color: white;
  }
  .tab.warning .n.hot {
    background: #f4d58d;
  }
  .spacer {
    flex: 1;
  }
  .hidden-toggle {
    color: var(--muted);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .body {
    flex: 1;
    overflow: auto;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    border-bottom: 1px solid var(--border);
  }
  .item.follow {
    opacity: 0.6;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
  }
  .head button {
    border: none;
    background: none;
    padding: 0;
    text-align: left;
  }
  .chev {
    color: var(--muted);
    width: 12px;
  }
  .icon {
    font-size: 11px;
  }
  .error .icon {
    color: var(--err);
  }
  .warning .icon {
    color: #bf8700;
  }
  .layout .icon {
    color: var(--muted);
  }
  .title {
    flex: 1;
    font-weight: 500;
    min-width: 0;
  }
  .tag {
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 4px;
  }
  .loc {
    font-family: Consolas, monospace;
    font-size: 12px;
    color: var(--accent) !important;
    white-space: nowrap;
  }
  .loc:hover {
    text-decoration: underline;
  }
  .detail {
    padding: 0 12px 10px 38px;
  }
  .detail p {
    margin: 4px 0 8px;
    line-height: 1.45;
  }
  .related {
    display: flex;
    gap: 12px;
  }
  .related .loc {
    border: none;
    background: none;
    padding: 0;
  }
  .fixes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .fix {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    font-family: Consolas, monospace;
    font-size: 12px;
  }
  .fix:hover {
    background: #2459b8 !important;
  }
  details summary {
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
  }
  pre {
    font-family: Consolas, monospace;
    font-size: 12px;
    white-space: pre-wrap;
    margin: 4px 0;
    color: #444;
  }
  .log {
    padding: 8px 12px;
    white-space: pre;
  }
  .empty {
    color: var(--muted);
    padding: 12px;
    margin: 0;
  }
</style>
