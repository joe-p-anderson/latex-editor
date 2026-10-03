// Talking to Zotero on this machine. A `RefProvider` finds references and
// returns BibTeX for them; two are built (Better BibTeX, preferred, and
// Zotero's own local API). Another reference manager (Mendeley) would be a
// third class with the same four members. Every call has a short timeout, so
// a closed or stuck Zotero never holds up the editor or a build for long.
import { entryKey, splitEntries, type BibItem } from '../bib'
import type { ProviderStatus } from '../types'
import { parseRpc, refsFromApi, refsFromBbt, type ApiRef, type Ref } from '../parse'

export interface RefProvider {
  readonly name: string
  /** Whether citation keys keep their value. (Better BibTeX's do; Zotero's own are made up on export.) */
  readonly stableKeys: boolean
  /** References matching `query`; ones with no citation key are left out. */
  search(query: string): Promise<Ref[]>
  /** BibTeX for these citation keys; keys it doesn't know are left out. */
  bibtex(keys: string[]): Promise<BibItem[]>
  /** BibTeX for these Zotero item keys, under their current citation keys. */
  byId(ids: string[]): Promise<BibItem[]>
}

export interface Timeouts {
  /** Probing whether Zotero is there. */
  probe: number
  /** Searching and exporting. */
  call: number
}

const DEFAULT_TIMEOUTS: Timeouts = { probe: 1500, call: 8000 }

/** Fetches `url`; throws with a plain message on a refusal, a timeout or an error status. */
async function http(url: string, init: RequestInit, ms: number | null): Promise<{ status: number; text: string; headers: Headers }> {
  try {
    const res = await fetch(url, { ...init, signal: ms == null ? undefined : AbortSignal.timeout(ms) })
    return { status: res.status, text: await res.text(), headers: res.headers }
  } catch (e) {
    const timedOut = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError'
    throw new Error(timedOut ? 'Zotero did not answer in time' : 'Zotero is not reachable')
  }
}

/** One Zotero on one port. */
export class Zotero {
  private last: { at: number; status: ProviderStatus } | null = null
  private probing: Promise<ProviderStatus> | null = null

  constructor(
    private readonly port: () => number,
    private readonly timeouts: Timeouts = DEFAULT_TIMEOUTS,
  ) {}

  private url(path: string) {
    return `http://127.0.0.1:${this.port()}${path}`
  }

  /** What is answering. A result at most `maxAgeMs` old is reused, so hooks that run often cost nothing when Zotero is closed. */
  async status(maxAgeMs = 0): Promise<ProviderStatus> {
    if (this.last && Date.now() - this.last.at <= maxAgeMs) return this.last.status
    this.probing ??= this.probe().finally(() => (this.probing = null))
    return this.probing
  }

  private async probe(): Promise<ProviderStatus> {
    const ms = this.timeouts.probe
    const [ping, api, bbt] = await Promise.all([
      http(this.url('/connector/ping'), {}, ms).catch(() => null),
      http(this.url('/api/'), { headers: { 'Zotero-API-Version': '3' } }, ms).catch(() => null),
      this.rpc<{ betterbibtex?: string; zotero?: string }>('api.ready', [], ms).catch(() => null),
    ])
    const status: ProviderStatus = {
      running: !!ping || !!api || !!bbt,
      localApi: api?.status === 200,
      bbt: bbt?.betterbibtex ?? null,
      zotero: bbt?.zotero ?? ping?.headers.get('x-zotero-version') ?? api?.headers.get('x-zotero-version') ?? null,
    }
    this.last = { at: Date.now(), status }
    return status
  }

  /** Better BibTeX's JSON-RPC. */
  async rpc<T>(method: string, params: unknown[], ms: number | null = this.timeouts.call): Promise<T> {
    const res = await http(this.url('/better-bibtex/json-rpc'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) }, ms)
    return parseRpc<T>(res.text)
  }

  async get(path: string, ms: number | null = this.timeouts.call): Promise<{ status: number; text: string }> {
    return http(this.url(path), { headers: { 'Zotero-API-Version': '3' } }, ms)
  }

  /** The best provider that is up, or null (Zotero closed, or neither interface on). */
  async provider(maxAgeMs = 0): Promise<RefProvider | null> {
    const s = await this.status(maxAgeMs)
    if (s.bbt) return new BbtProvider(this)
    if (s.localApi) return new ApiProvider(this)
    return null
  }

  /** Better BibTeX's "cite as you write" picker: waits for the person to choose, then returns the LaTeX it would paste. */
  async cayw(): Promise<string> {
    const res = await http(this.url('/better-bibtex/cayw?format=latex&command=cite'), {}, null)
    if (res.status !== 200) throw new Error('Better BibTeX could not open its picker')
    return res.text
  }
}

/** Better BibTeX: stable citation keys, and one call for several entries. */
export class BbtProvider implements RefProvider {
  readonly name = 'Better BibTeX'
  readonly stableKeys = true
  constructor(private readonly z: Zotero) {}

  async search(query: string): Promise<Ref[]> {
    const found = await this.z.rpc('item.search', [[['quicksearch-titleCreatorYear', 'contains', query]]])
    return refsFromBbt(found).slice(0, 30)
  }

  async bibtex(keys: string[]): Promise<BibItem[]> {
    if (!keys.length) return []
    const blocks = await this.exportKeys(keys)
    const out: BibItem[] = []
    for (const key of keys) {
      const bibtex = blocks[key]
      if (!bibtex) continue
      const hit = refsFromBbt(await this.z.rpc('item.search', [[['citationKey', 'is', key]]]).catch(() => []))[0]
      if (hit) out.push({ id: hit.id, key, bibtex })
    }
    return out
  }

  async byId(ids: string[]): Promise<BibItem[]> {
    if (!ids.length) return []
    const keys = await this.z.rpc<Record<string, string | null>>('item.citationkey', [ids])
    const wanted = ids.filter((id) => keys[id])
    const blocks = wanted.length ? await this.exportKeys(wanted.map((id) => keys[id]!)) : {}
    return wanted.flatMap((id) => (blocks[keys[id]!] ? [{ id, key: keys[id]!, bibtex: blocks[keys[id]!] }] : []))
  }

  private async exportKeys(keys: string[]): Promise<Record<string, string>> {
    try {
      return splitEntries(await this.z.rpc<string>('item.export', [keys, 'betterbibtex']))
    } catch {
      // One unknown key fails the whole export; ask again key by key.
      const out: Record<string, string> = {}
      for (const k of keys) Object.assign(out, splitEntries(await this.z.rpc<string>('item.export', [[k], 'betterbibtex']).catch(() => '')))
      return out
    }
  }
}

/** Zotero's own local API: works without Better BibTeX, but its citation keys are generated on export and can change. */
export class ApiProvider implements RefProvider {
  readonly name = 'Zotero'
  readonly stableKeys = false
  /** What searches returned, so a pick doesn't ask again. */
  private known = new Map<string, ApiRef>()
  constructor(private readonly z: Zotero) {}

  async search(query: string): Promise<Ref[]> {
    const q = encodeURIComponent(query)
    const res = await this.z.get(`/api/users/0/items/top?q=${q}&qmode=titleCreatorYear&itemType=-attachment&limit=30&format=json&include=data,bibtex`)
    if (res.status !== 200) throw new Error('Zotero\'s local API is off')
    const refs = refsFromApi(JSON.parse(res.text)).filter((r) => r.key)
    for (const r of refs) this.known.set(r.key, r)
    return refs.map(({ bibtex: _bibtex, ...r }) => r)
  }

  async bibtex(keys: string[]): Promise<BibItem[]> {
    return keys.flatMap((k) => {
      const r = this.known.get(k)
      return r ? [{ id: r.id, key: k, bibtex: r.bibtex }] : []
    })
  }

  async byId(ids: string[]): Promise<BibItem[]> {
    const out: BibItem[] = []
    for (const id of ids) {
      const res = await this.z.get(`/api/users/0/items/${encodeURIComponent(id)}?format=bibtex`).catch(() => null)
      const key = res?.status === 200 ? entryKey(res.text) : null
      if (res && key) out.push({ id, key, bibtex: res.text })
    }
    return out
  }
}
