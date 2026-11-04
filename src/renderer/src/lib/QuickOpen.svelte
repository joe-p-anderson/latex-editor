<script lang="ts">
  import { fuzzyFilter, isImage } from '@shared/images'
  import Picker from './Picker.svelte'

  /** Ctrl+P: type part of a file name, Enter opens it. (Ctrl+Shift+P is CommandPalette.svelte.) */
  let { files, onpick, onclose }: { files: string[]; onpick: (rel: string) => void; onclose: () => void } = $props()

  let query = $state('')

  const MAX = 60
  // Sources before images: "HW2" means HW2_….tex, not hw2_diagram.pdf.
  const results = $derived.by(() => {
    const hits = fuzzyFilter(query, files)
    return [...hits.filter((f) => !isImage(f)), ...hits.filter(isImage)].slice(0, MAX)
  })

  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  const folder = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
</script>

<Picker
  label="Open file"
  placeholder="Open a file by name…  (type / to match folders too)"
  {results}
  key={(rel) => rel}
  bind:query
  empty={`No files match "${query}".`}
  {onpick}
  {onclose}
>
  {#snippet row(rel)}
    <span class="name">{name(rel)}</span><span class="dir">{folder(rel)}</span>
  {/snippet}
</Picker>

<style>
  .dir {
    color: var(--ink-soft);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
