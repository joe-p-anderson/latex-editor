<script lang="ts">
  import { onMount } from 'svelte'
  import { badName, joinRel, splitExt } from '@shared/paths'
  import { fields, fill, type Starter } from '@shared/starters'

  /** Pick a starter, name the file, fill in its fields, choose a folder. */
  let {
    dir,
    folders,
    vaultName,
    oncreate,
    oncancel,
  }: {
    /** The folder that was in context ('' for the vault root). */
    dir: string
    /** Every folder in the vault. */
    folders: string[]
    vaultName: string
    /** Makes the file; resolves to an error message to show here, or null when it worked. */
    oncreate: (rel: string, text: string) => Promise<string | null>
    oncancel: () => void
  } = $props()

  const NEW_FOLDER = '\0new'
  const SOURCES = [
    ['built-in', 'Built in'],
    ['vault', 'This vault'],
    ['global', 'Your templates'],
  ] as const

  let starters = $state<Starter[]>([])
  let chosen = $state<Starter | null>(null)
  // svelte-ignore state_referenced_locally
  let folder = $state(dir)
  let newFolder = $state('')
  let name = $state('')
  let values = $state<Record<string, string>>({})
  let error = $state<string | null>(null)
  let busy = $state(false)
  let nameInput: HTMLInputElement

  onMount(async () => {
    starters = await window.api.listStarters()
    pick(starters.find((s) => s.name === 'Section') ?? starters[0])
    nameInput?.focus()
  })

  function pick(s: Starter | undefined) {
    if (!s) return
    chosen = s
    values = Object.fromEntries(fields(s.text).map((f) => [f.name, f.default]))
    error = null
  }

  const fieldList = $derived(chosen ? fields(chosen.text) : [])
  /** The file name, with the starter's extension added when none was typed. */
  const fileName = $derived.by(() => {
    const n = name.trim()
    if (!n || !chosen) return n
    return splitExt(n)[1] ? n : n + chosen.ext
  })
  const targetDir = $derived(folder === NEW_FOLDER ? newFolder.trim().replace(/^\/+|\/+$/g, '') : folder)
  const rel = $derived(joinRel(targetDir, fileName))
  const problem = $derived.by(() => {
    if (!name.trim()) return 'Enter a name'
    const bad = badName(fileName)
    if (bad) return bad
    if (folder === NEW_FOLDER && !targetDir) return 'Name the new folder'
    if (folder === NEW_FOLDER) for (const part of targetDir.split('/')) if (badName(part)) return badName(part)
    return null
  })
  const preview = $derived.by(() => {
    if (!chosen) return ''
    const base = fileName ? splitExt(fileName)[0] : 'untitled'
    const text = fill(chosen.text, values, { date: today(), filename: fileName || 'untitled', basename: base })
    return text.split('\n').slice(0, 12).join('\n')
  })

  const today = () => new Date().toISOString().slice(0, 10)

  async function create() {
    if (!chosen || problem || busy) return
    busy = true
    const base = splitExt(fileName)[0]
    const text = fill(chosen.text, values, { date: today(), filename: fileName, basename: base })
    error = await oncreate(rel, text)
    busy = false
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      oncancel()
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault()
      create()
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label="New file" tabindex="-1">
    <strong>New file</strong>
    <div class="cols">
      <div class="list" role="listbox" aria-label="Template">
        {#each SOURCES as [source, label]}
          {@const group = starters.filter((s) => s.source === source)}
          {#if group.length}
            <div class="group">{label}</div>
            {#each group as s (s.id)}
              <button class="item" class:on={chosen?.id === s.id} role="option" aria-selected={chosen?.id === s.id} onclick={() => pick(s)}>
                <span class="name">{s.name}</span><span class="ext">{s.ext}</span>
              </button>
            {/each}
          {/if}
        {/each}
      </div>
      <div class="form">
        {#if chosen?.description}<span class="hint">{chosen.description}</span>{/if}
        <label>
          Name
          <input bind:this={nameInput} bind:value={name} placeholder={`untitled${chosen?.ext ?? ''}`} spellcheck="false" />
        </label>
        <label>
          Folder
          <select bind:value={folder}>
            <option value="">{vaultName}</option>
            {#each folders as f}<option value={f}>{f}</option>{/each}
            <option value={NEW_FOLDER}>New folder…</option>
          </select>
        </label>
        {#if folder === NEW_FOLDER}
          <input bind:value={newFolder} placeholder="Folder name (sections/intro for nested)" spellcheck="false" aria-label="New folder" />
        {/if}
        {#each fieldList as f (f.name)}
          <label>
            {f.name}
            <input bind:value={values[f.name]} spellcheck="false" />
          </label>
        {/each}
        {#if preview}<pre class="preview" aria-label="Preview">{preview}</pre>{/if}
      </div>
    </div>
    <div class="foot">
      <span class="err" class:hint={!error}>{error ?? (name.trim() && problem ? problem : rel && !problem ? rel : '')}</span>
      <button onclick={oncancel}>Cancel</button>
      <button class="go" disabled={!!problem || busy} onclick={create}>Create</button>
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
    padding-top: 10vh;
    z-index: 100;
  }
  .dialog {
    width: min(680px, 94vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  .cols {
    display: flex;
    gap: 14px;
    min-height: 0;
    flex: 1;
  }
  .list {
    flex: none;
    width: 190px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    border-right: 1px solid var(--line);
    padding: 2px 6px 2px 0;
  }
  /* Labels share the rows' 6px inset so their text lines up. */
  .group {
    margin: 10px 0 2px;
    padding: 0 6px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .group:first-child {
    margin-top: 0;
  }
  .item {
    flex: none;
    display: flex;
    align-items: baseline;
    width: 100%;
    min-width: 0;
    text-align: left;
    border: 0;
    border-radius: 4px;
    background: none;
    padding: 4px 6px;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Inside the row: .list scrolls, so an outside ring would be clipped. */
  .item:focus-visible {
    outline-offset: -2px;
  }
  .item:hover,
  .item.on {
    background: var(--sel);
  }
  .ext {
    flex: none;
    color: var(--ink-soft);
    margin-left: auto;
    padding-left: 8px;
    font-size: 12px;
  }
  .form {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--ink-soft);
  }
  input,
  select {
    font: inherit;
    font-family: Consolas, 'Cascadia Mono', monospace;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    color: var(--ink);
    outline-color: var(--detail);
  }
  .preview {
    margin: 0;
    padding: 8px;
    max-height: 190px;
    overflow: auto;
    background: var(--sel);
    border-radius: 5px;
    font: 12px Consolas, 'Cascadia Mono', monospace;
    white-space: pre-wrap;
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
  .hint {
    color: var(--ink-soft);
    font-size: 12px;
  }
  .go {
    font-weight: 600;
  }
</style>
