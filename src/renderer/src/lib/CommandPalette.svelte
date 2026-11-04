<script lang="ts">
  import { keyLabel, paletteLabel, searchCommands, type Command } from './commands'
  import Picker from './Picker.svelte'

  /**
   * Ctrl+Shift+P: every command that can run now (from the command
   * registry), as "Category: Title" with its key on the right. Type to
   * narrow, Enter runs.
   */
  let { commands, onpick, onclose }: { commands: Command[]; onpick: (c: Command) => void; onclose: () => void } = $props()

  let query = $state('')
  const results = $derived(searchCommands(commands, query))
</script>

<Picker label="Run a command" placeholder="Run a command…" {results} key={(c) => c.id} bind:query empty={`No commands match "${query}".`} {onpick} {onclose}>
  {#snippet row(c)}
    <span class="name">{paletteLabel(c)}</span>
    {#if c.key}<kbd>{keyLabel(c.key)}</kbd>{/if}
  {/snippet}
</Picker>

<style>
  .name {
    flex: 1;
  }
  kbd {
    flex: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
  }
</style>
