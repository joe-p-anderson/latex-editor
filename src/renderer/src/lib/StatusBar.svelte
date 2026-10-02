<script lang="ts">
  /**
   * The status bar: the vault (with its endpaper chip), the branch and the
   * current section on the left; the cursor, view mode, spelling, problems
   * and engine on the right.
   */
  import Icon from './Icon.svelte'

  let {
    vaultName,
    swatch,
    branch,
    section,
    cursor,
    live,
    spelling,
    problems,
    onendpaper,
    onsection,
    onlive,
    onspelling,
    onproblems,
  }: {
    vaultName: string
    swatch: string
    branch: string | null
    /** The heading the cursor is under, e.g. "§2 Rolling". */
    section: string | null
    /** Null when no file is open. */
    cursor: { line: number; col: number } | null
    /** Null for files live mode isn't for (anything but .tex). */
    live: boolean | null
    spelling: boolean
    problems: { errors: number; warnings: number }
    onendpaper: () => void
    onsection: () => void
    onlive: () => void
    onspelling: () => void
    onproblems: () => void
  } = $props()
</script>

<footer class="statusbar">
  <button class="sb" onclick={onendpaper} title="Change this vault’s endpaper and paper">
    <span class="chip" style:background-image={swatch}></span>{vaultName}
  </button>
  {#if branch}<span class="sb static" title="Git branch"><Icon name="branch" size={13} />{branch}</span>{/if}
  {#if section}<button class="sb" onclick={onsection} title="Show the contents">{section}</button>{/if}
  <span class="spacer"></span>
  {#if cursor}
    <span class="sb static">Ln {cursor.line}, Col {cursor.col}</span>
    {#if live !== null}<button class="sb" onclick={onlive} title="Switch between the live view and source (Ctrl+Shift+L)">{live ? 'Live' : 'Source'}</button>{/if}
    <button class="sb" onclick={onspelling} title="Check spelling">Spelling: {spelling ? 'en-US' : 'off'}</button>
  {/if}
  <button class="sb" onclick={onproblems} title="Problems (Ctrl+J)">
    <Icon name="warn" size={13} />{problems.errors}{#if problems.warnings}<span class="soft">· {problems.warnings}</span>{/if}
  </button>
  <span class="sb static">pdfLaTeX</span>
</footer>

<style>
  .statusbar {
    height: 24px;
    flex: none;
    display: flex;
    align-items: stretch;
    white-space: nowrap;
    overflow: hidden;
    background: var(--chrome);
    color: var(--chrome-ink);
    box-shadow: inset 0 1px 0 var(--line);
    position: relative;
    z-index: 8;
  }
  .sb {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 0;
    font-size: 12px;
    font-weight: 500;
  }
  button.sb:hover:not(:disabled) {
    background: var(--chrome-btn);
  }
  .sb :global(.ic) {
    stroke-width: 1.9;
  }
  .chip {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    display: block;
    background-size: cover;
    box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.5);
  }
  .soft {
    color: var(--chrome-ink-soft);
  }
  .spacer {
    flex: 1;
  }
</style>
