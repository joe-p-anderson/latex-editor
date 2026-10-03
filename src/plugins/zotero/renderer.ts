import type { PluginRenderer } from '../../renderer/src/lib/plugins.svelte'
import type { Ref } from './parse'
import type { EnsureResult, ProviderStatus, SyncResult } from './types'
import Checklist from './ui/Checklist.svelte'

/** A cite-picker hit that remembers its Zotero item. */
type ZoteroHit = { key: string; title: string; authors: string; year: string; detail: string; zotero: string }

const bibName = (file: string) => file.slice(file.lastIndexOf('/') + 1)

const zotero: PluginRenderer = (ctx) => {
  // --- Status item: Zotero ● / ○ ------------------------------------------------
  let up = false
  const item = ctx.status.item({
    text: 'Zotero ○',
    tip: 'Checking Zotero…',
    onclick: () => (up ? void poll() : ctx.showSettings()),
  })
  const poll = async () => {
    try {
      const s = await ctx.invoke<ProviderStatus>('status')
      up = !!(s.bbt || s.localApi)
      item.set({
        text: up ? 'Zotero ●' : 'Zotero ○',
        tip: up
          ? `Zotero is reachable${s.bbt ? ` (Better BibTeX ${s.bbt})` : ' (no Better BibTeX: citation keys may change)'}`
          : s.running
            ? 'Zotero is running but its local API is off. Click for setup'
            : 'Zotero is not running. Click for setup',
      })
    } catch {
      up = false
      item.set({ text: 'Zotero ○', tip: 'Zotero is not reachable. Click for setup' })
    }
  }
  // Gently: now, once a minute, and when the window comes back into focus.
  void poll()
  const timer = setInterval(() => void poll(), 60_000)
  const onFocus = () => void poll()
  window.addEventListener('focus', onFocus)
  ctx.onDispose(() => (clearInterval(timer), window.removeEventListener('focus', onFocus)))

  // --- Putting items in the .bib ---------------------------------------------------
  /** Adds the wanted references to the document's .bib, tells the person, and returns the keys that can now be cited. */
  const ensure = async (want: { id?: string; key?: string }[]): Promise<string[]> => {
    const r = await ctx.invoke<EnsureResult>('ensure', want, await ctx.host.root())
    if (r.added.length) {
      const what = r.added.length === 1 ? r.added[0] : `${r.added.length} references`
      ctx.host.notify(r.created ? `Created ${bibName(r.file)} with ${what}` : `Added ${what} to ${bibName(r.file)}`)
      ctx.host.reloadBib()
    }
    if (r.missing.length) ctx.host.notify(`Zotero has no ${r.missing.join(', ')}`)
    return r.keys
  }

  ctx.cite.source({
    label: 'Zotero',
    search: async (q) =>
      (await ctx.invoke<Ref[]>('search', q)).map((r): ZoteroHit => ({ key: r.key, title: r.title, authors: r.authors, year: r.year, detail: r.venue, zotero: r.id })),
    pick: async (hit) => {
      try {
        const h = hit as ZoteroHit
        return (await ensure([{ key: h.key, id: h.zotero }]))[0] ?? null
      } catch (e) {
        ctx.host.notify((e as Error).message)
        return null
      }
    },
  })

  ctx.commands.add({
    id: 'sync',
    title: 'Sync bibliography from Zotero',
    run: async () => {
      const r = await ctx.invoke<SyncResult>('sync', await ctx.host.root())
      if (!r.files.length) return ctx.host.notify('No entries copied from Zotero in this vault yet')
      const parts = [`Updated ${r.updated}`, `${r.unchanged} already current`]
      if (r.renamed.length) parts.push(`${r.renamed.length} have a new key in Zotero and were left alone (${r.renamed.join(', ')})`)
      if (r.missing.length) parts.push(`${r.missing.length} not found in Zotero (${r.missing.join(', ')})`)
      ctx.host.notify(`${parts.join(', ')}.`)
      if (r.updated) ctx.host.reloadBib()
    },
  })

  ctx.commands.add({
    id: 'cite',
    title: 'Cite from Zotero…',
    run: async () => {
      ctx.host.notify('Choose in Zotero’s picker…')
      const keys = await ctx.invoke<string[]>('cayw')
      if (!keys.length) return ctx.host.notify('Nothing chosen')
      const have = await ensure(keys.map((key) => ({ key })))
      if (have.length) ctx.host.cite(have)
    },
  })

  ctx.panel(Checklist)
}

export default zotero
