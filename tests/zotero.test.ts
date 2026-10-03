import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appendFor, bibDeclaration, bibNamesIn, entryKey, normalizeEntry, scanEntries, splitEntries, upsertEntries } from '../src/plugins/zotero/bib'
import { citedKeysFromAux, collectionPath, keysChanged, keysFromCayw, missingKey, parseRpc, refsFromApi, refsFromBbt } from '../src/plugins/zotero/parse'
import { syncCollection } from '../src/plugins/zotero/main/collection'
import { chooseBib, ensureEntries, missingKeyFix, syncEntries, type BibFiles } from '../src/plugins/zotero/main/library'
import { Zotero } from '../src/plugins/zotero/main/provider'

const fx = (name: string) => readFile(join(__dirname, 'fixtures', 'zotero', name), 'utf8')

// --- the .bib editing ---------------------------------------------------------

const HAND = `% my references
@article{hand2001,
  title = {Written by hand {with} braces},
  year = 2001
}

@string{jacs = "J. Am. Chem. Soc."}

@book{Other1999, title={Other}}
`

describe('scanEntries', () => {
  it('finds entries, skips @string, and reads markers', () => {
    const text = `${HAND}\n% zotero: AAAA1111\n@article{z1,\n  title = {x}\n}\n`
    const spans = scanEntries(text)
    expect(spans.map((s) => s.key)).toEqual(['hand2001', '', 'Other1999', 'z1'])
    expect(spans.map((s) => s.zotero)).toEqual([null, null, null, 'AAAA1111'])
    const z = spans[3]
    expect(text.slice(z.start, z.end)).toBe('% zotero: AAAA1111\n@article{z1,\n  title = {x}\n}')
  })

  it('does not take a comment that is not directly above as a marker', () => {
    const spans = scanEntries('% zotero: AAAA1111\n\n@article{a, title={x}}\n')
    expect(spans[0].zotero).toBeNull()
  })

  it('copes with escaped braces and an unterminated entry', () => {
    expect(scanEntries('@misc{a, note = {a \\} b}}\n@misc{b, title = {x}}').map((s) => s.key)).toEqual(['a', 'b'])
    expect(scanEntries('@misc{a, title = {oops')).toEqual([])
  })
})

describe('entry text', () => {
  it('strips the machine-specific file field and renames a key', async () => {
    const one = splitEntries(await fx('bbt-export.bib')).doeExampleStudyLattice2020
    const n = normalizeEntry(one)
    expect(n).not.toMatch(/file\s*=/)
    expect(n).toMatch(/abstract = /)
    expect(entryKey(normalizeEntry(one, 'renamed'))).toBe('renamed')
  })

  it('splits a multi-entry export by key', async () => {
    expect(Object.keys(splitEntries(await fx('bbt-export.bib')))).toEqual(['doeExampleStudyLattice2020', 'Smith2015'])
  })
})

describe('upsertEntries', () => {
  const smith = { id: 'CCCC3333', key: 'Smith2015', bibtex: '@book{Smith2015,\n  title = {A Book},\n  year = 2015\n}' }
  const doe = { id: 'AAAA1111', key: 'doe2020', bibtex: '@article{doe2020,\n  title = {Doe},\n  year = 2020\n}' }

  it('appends marked entries and keeps everything else byte for byte', () => {
    const { text, results } = upsertEntries(HAND, [smith, doe])
    expect(text.startsWith(HAND)).toBe(true)
    expect(text.slice(HAND.length)).toBe('\n% zotero: CCCC3333\n@book{Smith2015,\n  title = {A Book},\n  year = 2015\n}\n\n% zotero: AAAA1111\n@article{doe2020,\n  title = {Doe},\n  year = 2020\n}\n')
    expect(results.map((r) => r.status)).toEqual(['added', 'added'])
    expect(appendFor(HAND, [smith, doe])).toBe(text.slice(HAND.length))
  })

  it('starts an empty file without a blank first line, and ends an unfinished last line first', () => {
    expect(upsertEntries('', [smith]).text).toBe('% zotero: CCCC3333\n@book{Smith2015,\n  title = {A Book},\n  year = 2015\n}\n')
    expect(upsertEntries('@misc{a}', [smith]).text.startsWith('@misc{a}\n\n% zotero')).toBe(true)
  })

  it('never touches a hand-written entry with the same key', () => {
    const clash = { id: 'ZZZZ9999', key: 'hand2001', bibtex: '@article{hand2001, title={Zotero version}}' }
    const { text, results } = upsertEntries(HAND, [clash], { refresh: true })
    expect(text).toBe(HAND)
    expect(results[0].status).toBe('exists')
  })

  it('does not add the same item twice', () => {
    const once = upsertEntries(HAND, [smith]).text
    const again = upsertEntries(once, [smith])
    expect(again.text).toBe(once)
    expect(again.results[0].status).toBe('unchanged')
  })

  it('refreshes only the marked entry, in place', () => {
    const base = upsertEntries(HAND, [smith, doe]).text
    const newer = { ...smith, bibtex: '@book{Smith2015,\n  title = {A Better Book},\n  year = 2016\n}' }
    const { text, results } = upsertEntries(base, [newer, doe], { refresh: true })
    expect(results.map((r) => r.status)).toEqual(['updated', 'unchanged'])
    expect(text).toContain('A Better Book')
    expect(text.startsWith(HAND)).toBe(true)
    expect(text.replace('A Better Book', 'A Book').replace('year = 2016', 'year = 2015')).toBe(base)
  })

  it('leaves an entry alone when Zotero now has another key for it (unless keys are unstable)', () => {
    const base = upsertEntries(HAND, [smith]).text
    const rekeyed = { ...smith, key: 'Smith2015a', bibtex: '@book{Smith2015a,\n  title = {New},\n  year = 2015\n}' }
    const kept = upsertEntries(base, [rekeyed], { refresh: true })
    expect(kept.text).toBe(base)
    expect(kept.results[0]).toMatchObject({ key: 'Smith2015', status: 'renamed' })
    const unstable = upsertEntries(base, [rekeyed], { refresh: true, keepKeys: true })
    expect(unstable.results[0].status).toBe('updated')
    expect(unstable.text).toContain('@book{Smith2015,\n  title = {New}')
  })

  it('keeps CRLF files CRLF', () => {
    const crlf = HAND.replace(/\n/g, '\r\n')
    const { text } = upsertEntries(crlf, [smith])
    expect(text.startsWith(crlf)).toBe(true)
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(text.match(/\n/g)!.length).toBe(text.match(/\r\n/g)!.length)
  })
})

describe('finding the document\'s bibliography', () => {
  it('lists .bib names, ignoring comments', () => {
    expect(bibNamesIn('%\\bibliography{no}\n\\bibliography{a, b.bib}\n\\addbibresource[location=remote]{c.bib}')).toEqual(['a.bib', 'b.bib', 'c.bib'])
  })

  it('proposes a \\bibliography line, or \\addbibresource for biblatex, only when there is none', () => {
    const tex = '\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n'
    const e = bibDeclaration(tex, 'refs/library.bib', 'refs')!
    expect(e.insert).toBe('\\bibliographystyle{plain}\n\\bibliography{library}\n\n')
    expect(tex.slice(e.from)).toBe('\\end{document}\n')
    const bl = bibDeclaration('\\documentclass{article}\n\\usepackage[style=ieee]{biblatex}\n\\begin{document}\n\\end{document}', 'library.bib')!
    expect(bl.insert).toBe('\\addbibresource{library.bib}\n')
    expect(bibDeclaration(`${tex}\\bibliography{x}`, 'library.bib')).toBeNull()
    expect(bibDeclaration('\\documentclass{revtex4-2}\n\\begin{document}\n\\end{document}', 'l.bib')!.insert).toBe('\\bibliography{l}\n\n')
  })
})

// --- parsing recorded responses -----------------------------------------------

describe('parsing', () => {
  it('reads a JSON-RPC result and an error', async () => {
    expect(parseRpc(await fx('bbt-ready.json'))).toEqual({ zotero: '9.0.6', betterbibtex: '9.0.68' })
    expect(() => parseRpc('<html>')).toThrow(/not JSON/)
    expect(() => parseRpc('{"error":{"message":"not found: x"}}')).toThrow('not found: x')
  })

  it('turns Better BibTeX search results into refs and drops attachments', async () => {
    const refs = refsFromBbt(parseRpc(await fx('bbt-search.json')))
    expect(refs).toEqual([
      { id: 'AAAA1111', key: 'doeExampleStudyLattice2020', title: 'An example study of lattice waves', authors: 'Doe, Roe', year: '2020', venue: 'Journal of Examples' },
      { id: 'CCCC3333', key: 'Smith2015', title: 'A Book About Lattices', authors: 'Smith', year: '2015', venue: 'Example Press' },
    ])
  })

  it('turns local API items into refs, taking the key from the data or the exported BibTeX', async () => {
    const refs = refsFromApi(JSON.parse(await fx('api-items.json')))
    expect(refs.map((r) => [r.id, r.key, r.authors, r.year, r.venue])).toEqual([
      ['AAAA1111', 'doeExampleStudyLattice2020', 'Doe, Roe', '2020', 'Journal of Examples'],
      ['DDDD4444', 'lee2018', 'Lee Group', '2018', 'Proc. Example'],
    ])
    expect(refs[0].bibtex).toContain('@article{doeExampleStudyLattice2020')
  })

  it('reads the keys from the picker\'s LaTeX, and nothing when cancelled', async () => {
    expect(keysFromCayw(await fx('cayw-latex.txt'))).toEqual(['doeExampleStudyLattice2020', 'Smith2015'])
    expect(keysFromCayw('\\cite[p. 3]{a}\\cite{a,b}')).toEqual(['a', 'b'])
    expect(keysFromCayw('')).toEqual([])
  })

  it('names the key of a "no entry" problem only', () => {
    expect(missingKey({ rule: 'undefined-citation', title: 'No bibliography entry "doe2020"' })).toBe('doe2020')
    expect(missingKey({ rule: 'undefined-citation', title: '"doe2020" isn\'t in the bibliography yet' })).toBeNull()
    expect(missingKey({ rule: 'undefined-reference', title: 'No bibliography entry "x"' })).toBeNull()
  })
})

describe('cited keys', () => {
  it('reads BibTeX and biblatex aux files, sorted and unique', () => {
    const aux = '\\citation{b,a}\n\\citation{a}\n\\citation{*}\n\\abx@aux@cite{0}{c}\n\\bibstyle{plain}'
    expect(citedKeysFromAux(aux)).toEqual(['a', 'b', 'c'])
  })

  it('notices a change in the set, not in the order or repeats', () => {
    const before = citedKeysFromAux('\\citation{a,b}')
    expect(keysChanged(before, citedKeysFromAux('\\citation{b}\\citation{a}\\citation{a}'))).toBe(false)
    expect(keysChanged(before, citedKeysFromAux('\\citation{a,b,c}'))).toBe(true)
    expect(keysChanged(before, citedKeysFromAux('\\citation{a}'))).toBe(true)
    expect(keysChanged(null, [])).toBe(true)
  })

  it('fills the collection pattern', () => {
    expect(collectionPath('endleaf/{vault}/{document}', 'Thesis', 'main')).toBe('endleaf/Thesis/main')
    expect(collectionPath('/Papers//{document}/', 'V', 'x')).toBe('Papers/x')
  })
})

// --- the provider against a mock Zotero -----------------------------------------

interface Mock {
  server: Server
  port: number
  calls: { method: string; params: unknown[] }[]
  close(): Promise<void>
}

/** A stand-in for Zotero with Better BibTeX. `opts.bbt` false makes it answer like Zotero with only the local API on. */
async function mockZotero(opts: { bbt?: boolean; api?: boolean; hang?: boolean } = {}): Promise<Mock> {
  const bbt = opts.bbt ?? true
  const api = opts.api ?? true
  const search = parseRpc(await fx('bbt-search.json')) as unknown[]
  const exported = await fx('bbt-export.bib')
  const items = await fx('api-items.json')
  const calls: Mock['calls'] = []
  const server = createServer((req, res) => {
    if (opts.hang) return // accepts, never answers
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const send = (status: number, text: string, type = 'application/json') => (res.writeHead(status, { 'Content-Type': type, 'X-Zotero-Version': '9.0.6' }), res.end(text))
      const url = req.url ?? ''
      if (url === '/connector/ping') return send(200, '<html>Zotero is running</html>', 'text/html')
      if (url === '/api/') return api ? send(200, 'Nothing to see here.', 'text/plain') : send(403, 'Local API is not enabled', 'text/plain')
      if (url.startsWith('/api/users/0/items/top')) return send(200, items)
      if (url.startsWith('/api/users/0/items/AAAA1111?format=bibtex')) return send(200, '\n@article{doeAuto2020,\n\ttitle = {Doe},\n}\n', 'text/plain')
      if (url.startsWith('/better-bibtex/cayw')) return send(200, '\\cite{Smith2015}', 'text/plain')
      if (url === '/better-bibtex/json-rpc' && bbt) {
        const { method, params } = JSON.parse(body)
        calls.push({ method, params })
        const ok = (result: unknown) => send(200, JSON.stringify({ jsonrpc: '2.0', result, id: 1 }))
        const fail = (message: string) => send(200, JSON.stringify({ jsonrpc: '2.0', error: { code: -32602, message }, id: null }))
        if (method === 'api.ready') return ok({ zotero: '9.0.6', betterbibtex: '9.0.68' })
        if (method === 'item.search') {
          const cond = (params[0] as string[][])[0]
          const hits = (search as { 'citation-key'?: string }[]).filter((s) => (cond[0] === 'citationKey' ? s['citation-key'] === cond[2] : true))
          return ok(hits)
        }
        if (method === 'item.export') {
          const keys = params[0] as string[]
          const blocks = splitEntries(exported)
          const unknown = keys.find((k) => !blocks[k])
          return unknown ? fail(`not found: ${unknown}`) : ok(keys.map((k) => blocks[k]).join('\n\n'))
        }
        if (method === 'item.citationkey') return ok(Object.fromEntries((params[0] as string[]).map((id) => [id, { AAAA1111: 'doeExampleStudyLattice2020', CCCC3333: 'Smith2015' }[id] ?? null])))
        // Like Better BibTeX: the path must start at a library.
        if (method === 'collection.scanAUX') return String(params[0]).startsWith('/') ? ok({ key: 'COLL0001', libraryID: 1 }) : fail(`collection path "${params[0]}" is not an absolute path`)
        return fail(`unknown method ${method}`)
      }
      send(404, 'not found', 'text/plain')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return { server, port, calls, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) }
}

const FAST = { probe: 300, call: 600 }

describe('the provider', () => {
  let bbt: Mock
  let apiOnly: Mock
  beforeAll(async () => {
    bbt = await mockZotero()
    apiOnly = await mockZotero({ bbt: false })
  })
  afterAll(async () => {
    await bbt.close()
    await apiOnly.close()
  })

  it('prefers Better BibTeX and finds items with their keys', async () => {
    const z = new Zotero(() => bbt.port, FAST)
    expect(await z.status()).toMatchObject({ running: true, localApi: true, bbt: '9.0.68', zotero: '9.0.6' })
    const p = (await z.provider())!
    expect(p.name).toBe('Better BibTeX')
    expect((await p.search('lattice')).map((r) => r.key)).toEqual(['doeExampleStudyLattice2020', 'Smith2015'])
    const items = await p.bibtex(['Smith2015', 'nope'])
    expect(items).toEqual([{ id: 'CCCC3333', key: 'Smith2015', bibtex: expect.stringContaining('@book{Smith2015') }])
    expect((await p.byId(['AAAA1111', 'ZZZZ'])).map((i) => i.key)).toEqual(['doeExampleStudyLattice2020'])
  })

  it('falls back to the local API when Better BibTeX is missing', async () => {
    const z = new Zotero(() => apiOnly.port, FAST)
    expect(await z.status()).toMatchObject({ running: true, localApi: true, bbt: null })
    const p = (await z.provider())!
    expect(p.name).toBe('Zotero')
    expect(p.stableKeys).toBe(false)
    expect((await p.search('x')).map((r) => r.key)).toEqual(['doeExampleStudyLattice2020', 'lee2018'])
    expect((await p.bibtex(['lee2018']))[0].id).toBe('DDDD4444')
    expect((await p.byId(['AAAA1111']))[0].key).toBe('doeAuto2020')
  })

  it('knows when the local API is off', async () => {
    const off = await mockZotero({ bbt: false, api: false })
    const z = new Zotero(() => off.port, FAST)
    expect(await z.status()).toMatchObject({ running: true, localApi: false, bbt: null })
    expect(await z.provider()).toBeNull()
    await off.close()
  })

  it('reads the picker\'s answer', async () => {
    expect(keysFromCayw(await new Zotero(() => bbt.port, FAST).cayw())).toEqual(['Smith2015'])
  })

  it('is quickly "not running" when nothing listens, and caches that', async () => {
    const dead = await mockZotero()
    const port = dead.port
    await dead.close()
    const z = new Zotero(() => port, FAST)
    const t = Date.now()
    expect(await z.status()).toMatchObject({ running: false, localApi: false, bbt: null })
    expect(await z.provider(10_000)).toBeNull()
    expect(Date.now() - t).toBeLessThan(1000)
    await expect((await mockedBbt(z)).search('x')).rejects.toThrow(/not reachable/)
  })

  it('gives up on a Zotero that accepts connections and never answers', async () => {
    const stuck = await mockZotero({ hang: true })
    const z = new Zotero(() => stuck.port, { probe: 150, call: 150 })
    const t = Date.now()
    expect((await z.status()).running).toBe(false)
    expect(Date.now() - t).toBeLessThan(1500)
    await expect(z.rpc('api.ready', [])).rejects.toThrow(/did not answer in time/)
    await stuck.close()
  })

  it('reuses a recent status instead of asking again', async () => {
    const z = new Zotero(() => bbt.port, FAST)
    await z.status()
    const before = bbt.calls.length
    await z.status(60_000)
    expect(bbt.calls.length).toBe(before)
  })
})

/** A Better BibTeX provider on the same (dead) Zotero, to see its calls fail plainly. */
async function mockedBbt(z: Zotero) {
  const { BbtProvider } = await import('../src/plugins/zotero/main/provider')
  return new BbtProvider(z)
}

// --- the library: choosing the .bib, adding, refreshing ----------------------------

/** A tiny in-memory vault. */
function memoryVault(initial: Record<string, string>): BibFiles & { files: Record<string, string>; writes: string[] } {
  const files = { ...initial }
  const writes: string[] = []
  return {
    files,
    writes,
    read: async (rel) => files[rel] ?? null,
    write: async (rel, text) => void ((files[rel] = text), writes.push(rel)),
  }
}

describe('library', () => {
  const MAIN = '\\documentclass{article}\n\\begin{document}\n\\cite{Smith2015}\n\\bibliography{AngStatsBib}\n\\end{document}\n'
  let mock: Mock
  beforeAll(async () => void (mock = await mockZotero()))
  afterAll(() => mock.close())
  const provider = async () => (await new Zotero(() => mock.port, FAST).provider())!

  it('prefers the .bib the document names', async () => {
    const v = memoryVault({ 'main.tex': MAIN, 'AngStatsBib.bib': HAND })
    expect(await chooseBib(v, 'main.tex', 'references.bib')).toEqual({ target: 'AngStatsBib.bib', named: ['AngStatsBib.bib'] })
    expect((await chooseBib(v, 'main.tex', 'AngStatsBib.bib')).target).toBe('AngStatsBib.bib')
    expect((await chooseBib(memoryVault({ 'x.tex': '\\begin{document}\\end{document}' }), 'x.tex', 'references.bib')).target).toBe('references.bib')
    expect((await chooseBib(memoryVault({}), null, 'references.bib')).target).toBe('references.bib')
  })

  it('finds a .bib next to a document in a folder', async () => {
    const v = memoryVault({ 'paper/main.tex': '\\bibliography{refs}', 'paper/refs.bib': '' })
    expect((await chooseBib(v, 'paper/main.tex', 'references.bib')).target).toBe('paper/refs.bib')
  })

  it('appends a picked item and keeps the hand-written text', async () => {
    const v = memoryVault({ 'main.tex': MAIN, 'AngStatsBib.bib': HAND })
    const r = await ensureEntries(v, await provider(), [{ key: 'Smith2015', id: 'CCCC3333' }], 'main.tex', 'references.bib')
    expect(r).toMatchObject({ keys: ['Smith2015'], added: ['Smith2015'], file: 'AngStatsBib.bib', created: false, missing: [] })
    expect(v.files['AngStatsBib.bib'].startsWith(HAND)).toBe(true)
    expect(v.files['AngStatsBib.bib']).toContain('% zotero: CCCC3333\n@book{Smith2015,')
    // Asking again writes nothing.
    const again = await ensureEntries(v, await provider(), [{ key: 'Smith2015' }], 'main.tex', 'references.bib')
    expect(again).toMatchObject({ keys: ['Smith2015'], added: [] })
    expect(v.writes).toHaveLength(1)
  })

  it('creates the .bib when it is missing and reports keys Zotero lacks', async () => {
    const v = memoryVault({ 'x.tex': '\\begin{document}\\end{document}' })
    const r = await ensureEntries(v, await provider(), [{ key: 'doeExampleStudyLattice2020' }, { key: 'ghost' }], 'x.tex', 'references.bib')
    expect(r).toMatchObject({ file: 'references.bib', created: true, added: ['doeExampleStudyLattice2020'], missing: ['ghost'] })
    expect(v.files['references.bib']).not.toMatch(/file\s*=/)
  })

  it('does not take over a hand-written entry with the same key', async () => {
    const mine = '@book{Smith2015, title = {My own copy}}\n'
    const v = memoryVault({ 'references.bib': mine })
    const r = await ensureEntries(v, await provider(), [{ key: 'Smith2015' }], null, 'references.bib')
    expect(r).toMatchObject({ keys: ['Smith2015'], added: [] })
    expect(v.files['references.bib']).toBe(mine)
  })

  it('syncs only the entries it wrote', async () => {
    const stale = `${HAND}\n% zotero: CCCC3333\n@book{Smith2015,\n  title = {Old title}\n}\n\n% zotero: GONE0000\n@misc{gone,\n  title = {Removed from Zotero}\n}\n`
    const v = memoryVault({ 'main.tex': MAIN, 'AngStatsBib.bib': stale })
    const r = await syncEntries(v, await provider(), 'main.tex', 'references.bib')
    expect(r).toMatchObject({ files: ['AngStatsBib.bib'], updated: 1, unchanged: 0, renamed: [], missing: ['gone'] })
    const out = v.files['AngStatsBib.bib']
    expect(out.startsWith(HAND)).toBe(true)
    expect(out).toContain('A Book About Lattices')
    expect(out).toContain('Removed from Zotero')
    expect(out).not.toContain('Old title')
    const second = await syncEntries(v, await provider(), 'main.tex', 'references.bib')
    expect(second.updated).toBe(0)
    expect(v.writes).toHaveLength(1)
  })

  it('offers "Add <key> from Zotero" only when Zotero knows the key', async () => {
    const v = memoryVault({ 'main.tex': MAIN, 'AngStatsBib.bib': HAND })
    const fix = await missingKeyFix(v, await provider(), { rule: 'undefined-citation', title: 'No bibliography entry "Smith2015"' }, 'main.tex', 'references.bib')
    expect(fix?.label).toBe('Add Smith2015 from Zotero')
    expect(fix?.edits[0].file).toBe('AngStatsBib.bib')
    expect(fix?.edits[0].append).toBe(appendFor(HAND, [{ id: 'CCCC3333', key: 'Smith2015', bibtex: splitEntries(await fx('bbt-export.bib')).Smith2015 }]))
    expect(await missingKeyFix(v, await provider(), { rule: 'undefined-citation', title: 'No bibliography entry "ghost"' }, 'main.tex', 'references.bib')).toBeNull()
    expect(await missingKeyFix(v, await provider(), { rule: 'undefined-reference', title: 'No bibliography entry "Smith2015"' }, 'main.tex', 'references.bib')).toBeNull()
    expect(v.writes).toHaveLength(0)
  })

  it('offers the fix when the .bib doesn’t exist yet (applying it creates the file)', async () => {
    const v = memoryVault({ 'main.tex': '\\documentclass{article}\n\\begin{document}\\cite{Smith2015}\n\\bibliography{refs}\n\\end{document}\n' })
    const fix = await missingKeyFix(v, await provider(), { rule: 'undefined-citation', title: 'No bibliography entry "Smith2015"' }, 'main.tex', 'refs.bib')
    expect(fix?.edits[0].file).toBe('refs.bib')
    expect(fix?.edits[0].append).toContain('Smith2015')
    expect(v.writes).toHaveLength(0)
  })
})

// --- optional collection sync ---------------------------------------------------

describe('collection sync', () => {
  let dir: string
  let mock: Mock
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'zotero-sync-'))
    mock = await mockZotero()
  })
  afterAll(async () => {
    await mock.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('calls scanAUX only when the cited keys changed', async () => {
    const aux = join(dir, 'main.aux')
    const zot = new Zotero(() => mock.port, FAST)
    const run = () => syncCollection({ zot, collection: 'endleaf/V/main', auxPath: aux, cacheDir: join(dir, 'cache') })
    const scans = () => mock.calls.filter((c) => c.method === 'collection.scanAUX')
    await writeFile(aux, '\\citation{a,b}\n')
    expect(await run()).toBe('synced')
    // Better BibTeX's path starts with the library's name, from the local API.
    expect(scans()[0].params).toEqual(['/My Library/endleaf/V/main', aux])
    expect(await run()).toBe('unchanged')
    await writeFile(aux, '\\citation{b}\n\\citation{a}\n')
    expect(await run()).toBe('unchanged')
    await writeFile(aux, '\\citation{a,b,c}\n')
    expect(await run()).toBe('synced')
    expect(scans()).toHaveLength(2)
    // A different collection name counts as a change too.
    expect(await syncCollection({ zot, collection: 'endleaf/V/other', auxPath: aux, cacheDir: join(dir, 'cache') })).toBe('synced')
    expect(await readFile(join(dir, 'cache', 'collection.json'), 'utf8')).toContain('other')
  })

  it('does nothing without Better BibTeX or an .aux, and remembers nothing when Zotero refuses', async () => {
    const plain = await mockZotero({ bbt: false })
    expect(await syncCollection({ zot: new Zotero(() => plain.port, FAST), collection: 'c', auxPath: join(dir, 'main.aux'), cacheDir: join(dir, 'c2') })).toBe('no-bbt')
    await plain.close()
    const zot = new Zotero(() => mock.port, FAST)
    expect(await syncCollection({ zot, collection: 'c', auxPath: join(dir, 'missing.aux'), cacheDir: join(dir, 'c3') })).toBe('no-aux')
    const dead = await mockZotero()
    const port = dead.port
    await dead.close()
    expect(await syncCollection({ zot: new Zotero(() => port, FAST), collection: 'c', auxPath: join(dir, 'main.aux'), cacheDir: join(dir, 'c4') })).toBe('no-bbt')
  })
})
