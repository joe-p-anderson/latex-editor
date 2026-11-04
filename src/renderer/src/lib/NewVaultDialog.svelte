<script lang="ts">
  import { onMount } from 'svelte'
  import type { Starter } from '@shared/starters'

  /** New vault…, after the folder picker: the vault's name and the starter main.tex comes from. */
  let {
    folder,
    name: initialName,
    starters,
    preselect,
    oncreate,
    oncancel,
  }: {
    /** The folder picked, shown so it's clear where the files go. */
    folder: string
    /** The folder's name, the default. */
    name: string
    starters: Starter[]
    preselect: string | null
    /** Makes the vault; resolves to an error message to show here, or null when it worked. */
    oncreate: (name: string, starter: string) => Promise<string | null>
    oncancel: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let name = $state(initialName)
  // svelte-ignore state_referenced_locally
  let chosen = $state(starters.find((s) => s.id === preselect) ?? starters[0])
  let error = $state<string | null>(null)
  let busy = $state(false)
  let nameInput: HTMLInputElement

  onMount(() => {
    nameInput.focus()
    nameInput.select()
  })

  async function create(): Promise<void> {
    if (!chosen || busy) return
    busy = true
    error = await oncreate(name.trim() || initialName, chosen.id)
    busy = false
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      oncancel()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      create()
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="New vault" tabindex="-1">
    <strong>New vault</strong>
    <span class="hint" title={folder}>{folder}</span>
    <label>
      Name
      <input bind:this={nameInput} bind:value={name} spellcheck="false" />
    </label>
    <div class="label" id="starter-label">Starter for main.tex</div>
    <div class="list" role="listbox" aria-labelledby="starter-label">
      {#each starters as s (s.id)}
        <button class="item" class:on={chosen?.id === s.id} role="option" aria-selected={chosen?.id === s.id} title={s.description} onclick={() => (chosen = s)} ondblclick={create}>
          <span class="name">{s.name}</span>{#if s.id === preselect}<span class="dflt" aria-label="default" title="The app-wide default">•</span>{/if}
        </button>
      {/each}
    </div>
    {#if chosen?.description}<span class="hint">{chosen.description}</span>{/if}
    <div class="foot">
      <span class="err">{error ?? ''}</span>
      <button onclick={oncancel}>Cancel</button>
      <button class="go" disabled={!chosen || busy} onclick={create}>Create</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 14vh;
    z-index: 100;
  }
  .dialog {
    width: min(460px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  label,
  .label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--ink-soft);
  }
  input {
    font: inherit;
    font-family: Consolas, 'Cascadia Mono', monospace;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    color: var(--ink);
    outline-color: var(--detail);
  }
  .list {
    max-height: 220px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: -5px;
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 3px;
  }
  .item {
    flex: none;
    display: flex;
    align-items: baseline;
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 4px;
    background: none;
    padding: 4px 6px;
  }
  .item:focus-visible {
    outline-offset: -2px;
  }
  .item:hover,
  .item.on {
    background: var(--sel);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dflt {
    flex: none;
    margin-left: 5px;
    color: var(--detail);
  }
  .hint {
    color: var(--ink-soft);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .err {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #c0504d;
    font-size: 12px;
  }
  .go {
    font-weight: 600;
  }
</style>
