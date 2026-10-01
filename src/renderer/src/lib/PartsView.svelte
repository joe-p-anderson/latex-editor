<script lang="ts">
  /** The Document parts tool: the root document and the files it \inputs, in order. */
  let {
    root,
    parts,
    active,
    onopen,
  }: {
    root: string
    /** Vault-relative; those that don't exist are shown as missing. */
    parts: { rel: string; exists: boolean }[]
    active: string | null
    onopen: (rel: string) => void
  } = $props()

  const name = (rel: string) => rel.split('/').pop()
</script>

<div class="view">
  <div class="head">Document parts</div>
  <button class="row" class:on={active === root} onclick={() => onopen(root)} title={root}><b>{name(root)}</b></button>
  {#each parts as p (p.rel)}
    <button class="row part" class:on={active === p.rel} class:missing={!p.exists} disabled={!p.exists} onclick={() => onopen(p.rel)} title={p.exists ? p.rel : `${p.rel} doesn't exist`}>
      {name(p.rel)}<span class="dir">{p.rel.includes('/') ? p.rel.slice(0, p.rel.lastIndexOf('/')) : ''}</span>
    </button>
  {/each}
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    overflow: auto;
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
  .row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    height: 25px;
    padding: 0 10px 0 14px;
    border: 0;
    border-radius: 0;
    text-align: left;
    white-space: nowrap;
    font-size: 13.5px;
  }
  .row.part {
    padding-left: 28px;
  }
  .row.on {
    background: color-mix(in srgb, var(--detail) 15%, transparent);
    font-weight: 600;
  }
  .row.missing {
    color: var(--err);
  }
  .dir {
    font-size: 11.5px;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
