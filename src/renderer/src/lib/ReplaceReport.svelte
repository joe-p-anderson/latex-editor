<script lang="ts">
  /**
   * What a Replace All changed: how many, in which files and on which lines
   * (each a link there), with Undo and Save all. It stays until dismissed or
   * acted on, since the changed files are left unsaved.
   */
  let {
    files,
    onjump,
    onundo,
    onsave,
    onclose,
  }: {
    files: { rel: string; lines: number[] }[]
    onjump: (rel: string, line: number) => void
    onundo: () => void
    onsave: () => void
    onclose: () => void
  } = $props()

  let open = $state(false)
  const count = $derived(files.reduce((n, f) => n + f.lines.length, 0))
  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  // Several matches on one line show it once.
  const unique = (lines: number[]) => [...new Set(lines)]
</script>

<div class="report" role="status">
  <div class="head">
    <button class="tri" title={open ? 'Hide where' : 'Show where'} aria-expanded={open} onclick={() => (open = !open)}>{open ? '▾' : '▸'}</button>
    <span class="what">Replaced {count} in {files.length} file{files.length === 1 ? '' : 's'}, unsaved</span>
    <button onclick={onundo} title="Put back the replaced text in every file">Undo</button>
    <button onclick={onsave} title="Save the changed files, closing the tabs the replace opened">Save all</button>
    <button class="x" onclick={onclose} title="Dismiss">×</button>
  </div>
  {#if open}
    <ul>
      {#each files as f (f.rel)}
        <li>
          <span class="file" title={f.rel}>{name(f.rel)}</span>
          <span class="n">{f.lines.length}</span>
          <span class="lines">
            {#each unique(f.lines) as line (line)}
              <button class="line" title="Go to line {line}" onclick={() => onjump(f.rel, line)}>{line}</button>
            {/each}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .report {
    position: absolute;
    right: 14px;
    bottom: 14px;
    max-width: min(460px, calc(100% - 28px));
    max-height: 50%;
    display: flex;
    flex-direction: column;
    border-radius: 4px;
    color: var(--ink);
    background: color-mix(in srgb, var(--detail) 14%, var(--paper));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    z-index: 10;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 4px;
  }
  .head button {
    padding: 1px 10px;
    font-weight: 600;
  }
  .head .tri,
  .head .x {
    border: none;
    background: none;
    padding: 0 4px;
    font-weight: normal;
    color: var(--ink-soft);
  }
  .what {
    flex: 1;
    white-space: nowrap;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 10px 8px 24px;
    overflow: auto;
    font-size: 12px;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 0;
  }
  .file {
    font-weight: 600;
    white-space: nowrap;
  }
  .n {
    color: var(--ink-soft);
    font-size: 11px;
    background: var(--line);
    border-radius: 8px;
    padding: 0 6px;
  }
  .lines {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
  }
  .line {
    border: none;
    background: none;
    padding: 0;
    color: var(--detail);
    font-family: Consolas, 'Cascadia Mono', monospace;
    text-decoration: underline;
  }
</style>
