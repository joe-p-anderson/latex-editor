<script lang="ts">
  /**
   * Shown while no TeX distribution is installed (on the welcome screen and in
   * the empty PDF pane): where to get one, and Check again, which looks again
   * without a restart.
   */
  import { checkTeX } from './tex.svelte'

  const MIKTEX_URL = 'https://miktex.org/download'
  const TEXLIVE_URL = 'https://tug.org/texlive/'

  let checking = $state(false)
  let stillMissing = $state(false)
  async function again(): Promise<void> {
    checking = true
    try {
      stillMissing = !(await checkTeX())
    } finally {
      checking = false
    }
  }
</script>

<div class="no-tex" role="status">
  <p class="what">endleaf needs a TeX distribution to build PDFs</p>
  <p>
    You can write in the meantime; saving saves, and building starts once TeX is installed. Get
    <a href={MIKTEX_URL} onclick={(e) => (e.preventDefault(), window.api.openExternal(MIKTEX_URL))}>MiKTeX</a> (Windows) or
    <a href={TEXLIVE_URL} onclick={(e) => (e.preventDefault(), window.api.openExternal(TEXLIVE_URL))}>TeX Live</a>, then check again.
  </p>
  <div class="row">
    <button class="again" onclick={again} disabled={checking}>{checking ? 'Checking…' : 'Check again'}</button>
    {#if stillMissing && !checking}<span class="still">Still not found.</span>{/if}
  </div>
</div>

<style>
  .no-tex {
    max-width: 420px;
    padding: 12px 16px;
    border: 1px solid color-mix(in srgb, var(--warn) 60%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--warn) 10%, var(--paper));
    color: var(--ink);
    font: 14px/1.45 var(--f-page);
    text-align: left;
  }
  p {
    margin: 0 0 8px;
  }
  .what {
    font-weight: 600;
  }
  a {
    color: inherit;
    text-decoration: underline;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .again {
    border: 1px solid color-mix(in srgb, var(--ink) 45%, transparent);
    padding: 4px 12px;
    border-radius: 2px;
    font: 600 13px var(--f-page);
  }
  .still {
    color: var(--ink-soft);
  }
</style>
