<script lang="ts">
  import type { TreeNode } from '@shared/api'

  let {
    nodes,
    active,
    dirty,
    onopen,
  }: {
    nodes: TreeNode[]
    active: string | null
    dirty: Set<string>
    onopen: (rel: string) => void
  } = $props()

  // Folders start collapsed; the active file's ancestors are opened for it.
  let expanded = $state(new Set<string>())
  $effect(() => {
    if (!active) return
    const parts = active.split('/')
    for (let i = 1; i < parts.length; i++) expanded.add(parts.slice(0, i).join('/'))
    expanded = new Set(expanded)
  })

  function toggle(rel: string) {
    if (expanded.has(rel)) expanded.delete(rel)
    else expanded.add(rel)
    expanded = new Set(expanded)
  }
</script>

{#snippet branch(list: TreeNode[], depth: number)}
  {#each list as node (node.rel)}
    {#if node.kind === 'dir'}
      <button class="row" style:padding-left="{8 + depth * 14}px" onclick={() => toggle(node.rel)}>
        <span class="chev">{expanded.has(node.rel) ? '▾' : '▸'}</span>{node.name}
      </button>
      {#if expanded.has(node.rel) && node.children}
        {@render branch(node.children, depth + 1)}
      {/if}
    {:else}
      <button
        class="row file"
        class:active={node.rel === active}
        style:padding-left="{22 + depth * 14}px"
        title={node.rel}
        onclick={() => onopen(node.rel)}
      >
        {node.name}{#if dirty.has(node.rel)}<span class="dot">●</span>{/if}
      </button>
    {/if}
  {/each}
{/snippet}

<nav>{@render branch(nodes, 0)}</nav>

<style>
  nav {
    overflow: auto;
    height: 100%;
    padding: 4px 0;
  }
  .row {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    border-radius: 0;
    background: none;
    padding-top: 3px;
    padding-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row:hover {
    background: var(--accent-soft);
  }
  .chev {
    display: inline-block;
    width: 14px;
    color: var(--muted);
  }
  .active {
    background: var(--accent-soft);
    font-weight: 600;
  }
  .dot {
    color: var(--accent);
    margin-left: 6px;
    font-size: 9px;
  }
</style>
