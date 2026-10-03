<script lang="ts">
  import { onMount } from 'svelte'
  import type { RendererContext } from '../../../renderer/src/lib/plugins.svelte'
  import { bibDeclaration } from '../bib'
  import type { Checklist } from '../types'

  let { ctx }: { ctx: RendererContext } = $props()

  const DOWNLOAD = 'https://www.zotero.org/download/'
  const BBT = 'https://github.com/retorquere/zotero-better-bibtex/releases/latest'
  const FORMULA = 'auth.lower + shortTitle3_3 + year'

  let list = $state<Checklist | null>(null)
  let root = $state<string | null>(null)
  let error = $state('')
  let busy = $state(false)

  async function refresh(): Promise<void> {
    try {
      root = await ctx.host.root()
      list = await ctx.invoke<Checklist>('checklist', root)
      error = ''
    } catch (e) {
      error = (e as Error).message
    }
  }

  // Live: checked on opening, then every few seconds while the panel is showing, and after each button.
  onMount(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  })

  async function act(f: () => Promise<unknown>): Promise<void> {
    busy = true
    try {
      await f()
    } catch (e) {
      error = (e as Error).message
    } finally {
      busy = false
      await refresh()
    }
  }

  const major = $derived(Number(/^\d+/.exec(list?.status.zotero ?? '')?.[0] ?? 0))
  const installed = $derived(!!list && (!!list.installed || (list.status.running && major >= 7)))
  const old = $derived(!!list?.status.zotero && major < 7)
  const running = $derived(!!list?.status.running)
  const api = $derived(!!list?.status.localApi)
  const bbt = $derived(list?.status.bbt ?? null)
  const bibOk = $derived(!!list?.bib.exists)
  const syncOn = $derived(!!ctx.settings.vault().syncCollection)

  async function addDeclaration(): Promise<void> {
    if (!root || !list) return
    const text = (await ctx.editor.textOf(root)).replace(/\r\n?/g, '\n')
    const dir = root.includes('/') ? root.slice(0, root.lastIndexOf('/')) : ''
    const edit = bibDeclaration(text, list.bib.file, dir)
    if (!edit) return void ctx.host.notify('Could not find where to put it: add \\bibliography{…} yourself')
    await ctx.editor.applyTo(root, [edit])
    ctx.host.notify(`Added the bibliography line to ${root}. Save it to use it`)
  }
</script>

<div class="zotero">
  {#if error}<p class="err">{error}</p>{/if}
  {#if !list}
    <p class="help">Checking…</p>
  {:else}
    <ol>
      <li class:done={installed} class:bad={old}>
        <span class="mark">{installed ? '✓' : '○'}</span>
        <div>
          <strong>Zotero 7 or later is installed</strong>
          {#if old}
            <p class="help">This is Zotero {list.status.zotero}. Zotero 6 has no local API: update it.</p>
          {:else if list.installed}
            <p class="help">Found {list.installed}</p>
          {:else if installed}
            <p class="help">Zotero {list.status.zotero} is running.</p>
          {/if}
          {#if !installed || old}<button disabled={busy} onclick={() => act(() => ctx.openLink(DOWNLOAD))}>Open the download page</button>{/if}
        </div>
      </li>
      <li class:done={running}>
        <span class="mark">{running ? '✓' : '○'}</span>
        <div>
          <strong>Zotero is running</strong>
          {#if !running}
            <p class="help">Nothing answers on port {ctx.settings.global().port}. If Zotero is open, check the port setting above and your firewall.</p>
            {#if list.installed}<button disabled={busy} onclick={() => act(() => ctx.invoke('launch'))}>Launch Zotero</button>{/if}
          {/if}
        </div>
      </li>
      <li class:done={api}>
        <span class="mark">{api ? '✓' : '○'}</span>
        <div>
          <strong>The local API is on</strong>
          {#if !api}
            <p class="help">In Zotero: Edit → Settings → Advanced → tick “Allow other applications on this computer to communicate with Zotero”. {bbt ? 'Better BibTeX works without it, but the fallback needs it.' : ''}</p>
          {/if}
        </div>
      </li>
      <li class:done={!!bbt}>
        <span class="mark">{bbt ? '✓' : '○'}</span>
        <div>
          <strong>Better BibTeX is installed <em>(recommended)</em></strong>
          {#if bbt}
            <p class="help">Version {bbt}.</p>
          {:else}
            <p class="help">It gives each reference a stable citation key. Without it the keys come from Zotero's exporter and can change.</p>
            <p class="help">Download the .xpi from its GitHub releases, then in Zotero: Tools → Plugins → the gear → Install Plugin From File, and restart Zotero.</p>
            <button disabled={busy} onclick={() => act(() => ctx.openLink(BBT))}>Open the releases page</button>
          {/if}
          <p class="help">Suggested citation key formula (Zotero → Settings → Better BibTeX): <code>{FORMULA}</code>. Changing the formula later renames keys, so \cite commands using the old ones stop working.</p>
        </div>
      </li>
      <li class="optional">
        <span class="mark">–</span>
        <div>
          <strong>Zotero Connector in your browser <em>(optional)</em></strong>
          <p class="help">Saves web pages and papers into Zotero. endleaf can't detect it; install it from zotero.org/download if you want it.</p>
        </div>
      </li>
      <li class:done={bibOk}>
        <span class="mark">{bibOk ? '✓' : '○'}</span>
        <div>
          <strong>This vault has a .bib file for Zotero items</strong>
          <p class="help">
            {#if bibOk}
              {list.bib.file}{list.bib.named.length ? ', named by the document' : ''}.
            {:else}
              {list.bib.file} does not exist yet. {list.bib.named.length ? 'The document names it.' : 'It is the plugin setting above.'}
            {/if}
          </p>
          {#if !bibOk}<button disabled={busy} onclick={() => act(() => ctx.invoke('createBib', root))}>Create {list.bib.file}</button>{/if}
          {#if list.declared === false && root}
            <p class="help">{root} does not name a bibliography yet.</p>
            <button disabled={busy} onclick={() => act(addDeclaration)}>Add it to {root}</button>
            <p class="help">With biblatex it adds <code>\addbibresource</code> instead.</p>
          {/if}
        </div>
      </li>
      <li class="optional" class:done={syncOn && !!bbt}>
        <span class="mark">{syncOn && bbt ? '✓' : '–'}</span>
        <div>
          <strong>Collection sync <em>(optional)</em></strong>
          <p class="help">
            {#if !syncOn}Off. Turn on “Sync a Zotero collection” in the settings above to fill a collection with what the document cites.
            {:else if !bbt}On, but it needs Better BibTeX.
            {:else}On: after a full build the collection is cleared and refilled with the cited references.{/if}
          </p>
        </div>
      </li>
    </ol>
  {/if}
</div>

<style>
  .zotero {
    margin-top: 8px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
    font-size: 12px;
  }
  .mark {
    width: 14px;
    text-align: center;
    color: var(--ink-soft);
    flex: none;
  }
  .done .mark {
    color: var(--detail);
    font-weight: 700;
  }
  .bad .mark {
    color: var(--err, #c0392b);
  }
  strong {
    font-weight: 600;
  }
  em {
    font-weight: 400;
    color: var(--ink-soft);
  }
  .help {
    font-size: 12px;
    color: var(--ink-soft);
    margin: 2px 0 4px;
  }
  .err {
    font-size: 12px;
    color: var(--err, #c0392b);
  }
  code {
    font-size: 11px;
  }
  button {
    font: 12px var(--f-ui);
    margin: 2px 6px 4px 0;
  }
</style>
