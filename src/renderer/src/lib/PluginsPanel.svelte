<script lang="ts">
  /**
   * The Plugins view: each plugin with its switch for this vault, its
   * default for vaults that haven't chosen, its settings, and anything the
   * plugin shows here itself (e.g. a setup checklist). Changes apply at once.
   */
  import type { Component } from 'svelte'
  import type { PluginState, SettingField, SettingValue } from '@shared/plugin'
  import type { RendererContext } from './plugins.svelte'
  import Icon from './Icon.svelte'

  let {
    states,
    panels,
    vaultName,
  }: {
    states: PluginState[]
    panels: { plugin: string; component: Component<{ ctx: RendererContext }>; ctx: RendererContext }[]
    vaultName: string
  } = $props()

  // Which plugins' settings are unfolded.
  let open = $state(new Set<string>())
  const toggleOpen = (id: string) => {
    const next = new Set(open)
    if (!next.delete(id)) next.add(id)
    open = next
  }

  let error = $state<string | null>(null)
  async function change(id: string, c: Parameters<typeof window.api.changePlugin>[1]): Promise<void> {
    error = null
    await window.api.changePlugin(id, c).catch((e: Error) => (error = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }

  const setVault = (id: string, key: string, v: SettingValue) => change(id, { vaultSettings: { [key]: v } })
  const setGlobal = (id: string, key: string, v: SettingValue) => change(id, { globalSettings: { [key]: v } })
</script>

{#snippet field(f: SettingField, value: SettingValue, set: (v: SettingValue) => void)}
  <label class="field" title={f.help}>
    {#if f.type === 'bool'}
      <input type="checkbox" checked={value === true} onchange={(e) => set(e.currentTarget.checked)} />
      <span>{f.label}</span>
    {:else}
      <span class="flabel">{f.label}</span>
      {#if f.type === 'enum'}
        <select value={value} onchange={(e) => set(e.currentTarget.value)}>
          {#each f.options as o (o)}<option value={o}>{o}</option>{/each}
        </select>
      {:else if f.type === 'number'}
        <input type="number" min={f.min} max={f.max} value={value} onchange={(e) => set(+e.currentTarget.value)} />
      {:else}
        <input type="text" value={value} placeholder={f.placeholder} spellcheck="false" onchange={(e) => set(e.currentTarget.value.trim())} />
      {/if}
    {/if}
    {#if f.help}<span class="help">{f.help}</span>{/if}
  </label>
{/snippet}

<div class="panel">
  <div class="head"><span class="title">Plugins</span></div>
  <div class="body">
    <p class="intro">Features you can switch on for <strong>{vaultName}</strong>. Each vault keeps its own choice; vaults that haven't chosen follow the default.</p>
    {#if error}<p class="error">{error}</p>{/if}
    {#each states as s (s.manifest.id)}
      {@const m = s.manifest}
      {@const fields = [...(m.settings?.vault ?? []), ...(m.settings?.global ?? [])]}
      {@const own = panels.filter((p) => p.plugin === m.id)}
      <section class="plugin" class:on={s.enabled}>
        <div class="top">
          <span class="icon"><Icon name={m.icon} size={20} /></span>
          <div class="text">
            <div class="name">{m.name}</div>
            <div class="desc">{m.description}</div>
          </div>
          <label class="switch" title="On in this vault">
            <input type="checkbox" checked={s.enabled} onchange={(e) => change(m.id, { vaultEnabled: e.currentTarget.checked })} />
          </label>
        </div>
        <div class="meta">
          {#if s.vaultChose}
            <span>{s.enabled ? 'On' : 'Off'} in this vault</span>
            <button class="link" onclick={() => change(m.id, { vaultEnabled: null })} title="Forget this vault's choice">Follow the default</button>
          {:else}
            <span>Following the default</span>
          {/if}
          <label class="default" title="Whether it's on in vaults that haven't chosen">
            <input type="checkbox" checked={s.enabledByDefault} onchange={(e) => change(m.id, { defaultEnabled: e.currentTarget.checked })} />
            On for new vaults
          </label>
          {#if fields.length || own.length}
            <button class="link" onclick={() => toggleOpen(m.id)}>{open.has(m.id) ? 'Hide settings' : 'Settings'}</button>
          {/if}
        </div>
        {#if open.has(m.id)}
          <div class="settings">
            {#each own as p (p)}<p.component ctx={p.ctx} />{/each}
            {#if m.settings?.vault?.length}
              <div class="group-h">This vault</div>
              {#each m.settings.vault as f (f.key)}{@render field(f, s.vaultSettings[f.key], (v) => setVault(m.id, f.key, v))}{/each}
            {/if}
            {#if m.settings?.global?.length}
              <div class="group-h">All vaults</div>
              {#each m.settings.global as f (f.key)}{@render field(f, s.globalSettings[f.key], (v) => setGlobal(m.id, f.key, v))}{/each}
            {/if}
            {#if !s.enabled && own.length === 0 && m.id}<p class="help">Switch it on to see its setup steps.</p>{/if}
          </div>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .head {
    padding: 8px 12px 6px;
  }
  .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 12px 16px;
  }
  .intro,
  .help {
    font-size: 12px;
    color: var(--ink-soft);
    margin: 0 0 10px;
  }
  .error {
    font-size: 12px;
    color: var(--err, #c0392b);
  }
  .plugin {
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .top {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .icon {
    color: var(--ink-soft);
    margin-top: 2px;
  }
  .plugin.on .icon {
    color: var(--detail);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .desc {
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 2px;
  }
  .switch input {
    width: 16px;
    height: 16px;
    accent-color: var(--detail);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin: 6px 0 0 30px;
    font-size: 11.5px;
    color: var(--ink-soft);
  }
  .default {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .default input,
  .field input[type='checkbox'] {
    accent-color: var(--detail);
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    font-size: 11.5px;
    color: var(--detail);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .settings {
    margin: 8px 0 0 30px;
  }
  .group-h {
    margin: 10px 0 4px;
    font: 600 13px var(--f-page);
    letter-spacing: 0.1em;
    font-variant-caps: all-small-caps;
    color: var(--ink-soft);
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin: 6px 0;
    font-size: 12.5px;
  }
  .flabel {
    flex: 0 0 100%;
    color: var(--ink-soft);
  }
  .field input[type='text'],
  .field input[type='number'],
  .field select {
    flex: 1;
    min-width: 0;
    font: inherit;
  }
  .field .help {
    flex: 0 0 100%;
    margin: 0;
    font-size: 11.5px;
  }
</style>
