<script lang="ts">
  import { untrack } from 'svelte'
  import type { CompileResult, Problem, QuickFix, Severity } from '@shared/api'
  import Icon from './Icon.svelte'

  /** The bottom panel: the last build's problems, and its log. */
  let {
    result,
    tab = $bindable('problems'),
    onjump,
    onfix,
    onclose,
  }: {
    result: CompileResult | null
    tab?: 'problems' | 'log'
    onjump: (p: Problem) => void
    onfix: (fix: QuickFix) => void
    onclose: () => void
  } = $props()

  let severity = $state<Severity>('error')
  let showHidden = $state(false)
  let expanded = $state(new Set<Problem>())

  const problems = $derived(result?.problems ?? [])
  const visible = $derived(problems.filter((p) => showHidden || !p.hidden))
  const count = (s: Severity) => visible.filter((p) => p.severity === s).length
  const hiddenCount = $derived(problems.filter((p) => p.hidden).length)
  const list = $derived(visible.filter((p) => p.severity === severity))

  // After each compile: show errors, expanding the headline one; otherwise
  // stay as the user left it, but land on a list that has something.
  // Only `result` is tracked: switching lists must not re-run this.
  $effect(() => {
    const r = result
    untrack(() => {
      const errors = (r?.problems ?? []).filter((p) => p.severity === 'error' && !p.hidden)
      if (errors.length) {
        severity = 'error'
        expanded = new Set(errors.filter((p) => !p.followOn).slice(0, 1))
      } else {
        expanded = new Set()
        if (severity === 'error') severity = count('warning') ? 'warning' : 'layout'
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

<section class="panel">
  <div class="bar">
    <button class="ptab" class:on={tab === 'problems'} onclick={() => (tab = 'problems')}>
      Problems{#if count('error')}<span class="pn">{count('error')}</span>{/if}
    </button>
    <button class="ptab" class:on={tab === 'log'} onclick={() => (tab = 'log')}>Log</button>
    {#if tab === 'problems' && result}
      <span class="sevs">
        {#each [['error', 'Errors'], ['warning', 'Warnings'], ['layout', 'Layout']] as [key, label] (key)}
          <button class="tab {key}" class:active={severity === key} onclick={() => (severity = key as Severity)}>
            {label} <span class="n" class:hot={count(key as Severity) > 0}>{count(key as Severity)}</span>
          </button>
        {/each}
      </span>
    {/if}
    <span class="spacer"></span>
    {#if tab === 'problems' && hiddenCount}
      <label class="hidden-toggle" title="Font substitutions, rerun notices and other routine messages">
        <input type="checkbox" bind:checked={showHidden} /> Show {hiddenCount} routine
      </label>
    {/if}
    <button class="close" onclick={onclose} title="Hide the panel (Ctrl+J)" aria-label="Hide the panel"><Icon name="x" size={14} /></button>
  </div>

  {#if !result}
    <p class="empty">Nothing built yet. Save a .tex file (Ctrl+S) to build it.</p>
  {:else}
    <div class="body">
      {#if tab === 'log'}
        <pre class="log">{result.log}</pre>
      {:else if list.length === 0}
        <p class="empty">No {severity === 'layout' ? 'layout notes' : `${severity}s`}.</p>
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
    background: var(--side);
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 32px;
    flex: none;
    padding: 0 6px 0 8px;
  }
  .bar .ptab {
    position: relative;
    padding: 5px 9px;
    font: 600 14px var(--f-page);
    letter-spacing: 0.12em;
    font-variant-caps: all-small-caps;
    color: var(--ink-soft);
  }
  .bar .ptab:hover:not(:disabled) {
    background: none;
    color: var(--ink);
  }
  .ptab.on {
    color: var(--ink);
  }
  .ptab.on::after {
    content: '';
    position: absolute;
    left: 9px;
    right: 9px;
    bottom: 1px;
    height: 1.5px;
    background: var(--detail);
  }
  .pn {
    color: var(--err);
    margin-left: 4px;
  }
  .sevs {
    display: flex;
    gap: 2px;
    margin-left: 10px;
  }
  .bar .close {
    display: grid;
    place-items: center;
    padding: 4px;
    color: var(--ink-soft);
  }
  .bar button {
    border: none;
    background: none;
    border-radius: 4px;
    padding: 3px 8px;
  }
  .bar button:hover {
    background: var(--sel);
  }
  .tab.active {
    background: var(--paper);
    box-shadow: 0 0 0 1px var(--line);
  }
  .n {
    display: inline-block;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--line);
    font-size: 11px;
    text-align: center;
  }
  .tab.error .n.hot {
    background: var(--err);
    color: var(--paper);
  }
  .tab.warning .n.hot {
    background: var(--warn);
  }
  .spacer {
    flex: 1;
  }
  .hidden-toggle {
    color: var(--ink-soft);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .body {
    flex: 1;
    overflow: auto;
    background: var(--paper);
    border-top: 1px solid var(--line);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    border-bottom: 1px solid var(--line);
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
    color: var(--ink-soft);
    width: 12px;
  }
  .icon {
    font-size: 11px;
  }
  .error .icon {
    color: var(--err);
  }
  .warning .icon {
    color: var(--warn);
  }
  .layout .icon {
    color: var(--ink-soft);
  }
  .title {
    flex: 1;
    font-weight: 500;
    min-width: 0;
  }
  .tag {
    font-size: 11px;
    color: var(--ink-soft);
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 0 4px;
  }
  .loc {
    font-family: Consolas, monospace;
    font-size: 12px;
    color: var(--detail) !important;
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
    background: var(--detail);
    color: var(--paper);
    border-color: var(--detail);
    font-family: Consolas, monospace;
    font-size: 12px;
  }
  .fix:hover {
    background: color-mix(in srgb, var(--detail) 85%, var(--ink)) !important;
  }
  details summary {
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 12px;
  }
  pre {
    font-family: Consolas, monospace;
    font-size: 12px;
    white-space: pre-wrap;
    margin: 4px 0;
    color: var(--ink);
  }
  .log {
    padding: 8px 12px;
    white-space: pre;
  }
  .empty {
    color: var(--ink-soft);
    padding: 12px;
    margin: 0;
  }
</style>
