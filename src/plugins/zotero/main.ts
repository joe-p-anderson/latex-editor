import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginMain } from '../../main/plugins'
import { bibNamesIn } from './bib'
import { collectionPath, keysFromCayw, type Ref } from './parse'
import { syncCollection } from './main/collection'
import { chooseBib, ensureEntries, missingKeyFix, syncEntries, type BibFiles } from './main/library'
import { Zotero } from './main/provider'
import type { Checklist, EnsureResult, SyncResult } from './types'

/** Places a Zotero install is usually found. */
const installPaths = (): string[] => {
  const env = process.env
  if (process.platform === 'win32') {
    return [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].flatMap((d) => (d ? [join(d, 'Zotero', 'zotero.exe')] : []))
  }
  if (process.platform === 'darwin') return ['/Applications/Zotero.app/Contents/MacOS/zotero']
  return ['/usr/bin/zotero', '/opt/zotero/zotero', join(homedir(), 'Zotero_linux-x86_64', 'zotero')]
}

const exists = (p: string) => access(p).then(() => true, () => false)

const main: PluginMain = async (ctx) => {
  const zot = new Zotero(() => Number(ctx.settings.global().port) || 23119)
  const files: BibFiles = { read: (rel) => ctx.vault.readOptional(rel), write: (rel, text) => ctx.vault.write(rel, text) }
  const setting = () => String(ctx.settings.vault().bib || 'references.bib')

  const needProvider = async () => {
    const p = await zot.provider()
    if (!p) throw new Error('Zotero is not reachable. Start it, and check the Zotero setup in the Plugins view.')
    return p
  }

  ctx.handle('status', () => zot.status())

  ctx.handle('search', async (query: string): Promise<Ref[]> => {
    const p = await zot.provider(5000)
    return p ? p.search(query) : []
  })

  ctx.handle('ensure', async (want: { id?: string; key?: string }[], root: string | null): Promise<EnsureResult> => ensureEntries(files, await needProvider(), want, root, setting()))

  ctx.handle('sync', async (root: string | null): Promise<SyncResult> => syncEntries(files, await needProvider(), root, setting()))

  // Better BibTeX's picker. It returns when the person has chosen (or closed it).
  ctx.handle('cayw', async (): Promise<string[]> => {
    if (!(await zot.status()).bbt) throw new Error('This needs Better BibTeX in Zotero')
    return keysFromCayw(await zot.cayw())
  })

  ctx.handle('checklist', async (root: string | null): Promise<Checklist> => {
    const status = await zot.status()
    const installed = (await Promise.all(installPaths().map(async (p) => ((await exists(p)) ? p : null)))).find(Boolean) ?? null
    const { target, named } = await chooseBib(files, root, setting())
    const tex = root ? await ctx.vault.readOptional(root) : null
    return { status, installed, bib: { file: target, exists: (await ctx.vault.readOptional(target)) !== null, named }, declared: tex === null ? null : bibNamesIn(tex).length > 0 }
  })

  // Only from the checklist's button.
  ctx.handle('createBib', async (root: string | null): Promise<string> => {
    const { target } = await chooseBib(files, root, setting())
    if ((await files.read(target)) === null) await files.write(target, '% References. Entries marked "% zotero: …" were copied from Zotero; the rest are yours.\n')
    return target
  })

  ctx.handle('launch', async () => {
    const exe = (await Promise.all(installPaths().map(async (p) => ((await exists(p)) ? p : null)))).find(Boolean)
    if (!exe) throw new Error('Zotero is not installed in the usual places')
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
  })

  // "Add <key> from Zotero" on a citation with no entry. A closed Zotero costs nothing: its status is remembered for 15 s.
  ctx.build.fixes(async (problem, build) => {
    if (problem.rule !== 'undefined-citation') return []
    const provider = await zot.provider(15_000)
    if (!provider) return []
    const fix = await missingKeyFix(files, provider, problem, build.root, setting())
    return fix ? [fix] : []
  })

  // Optional: keep a Zotero collection equal to what the document cites.
  ctx.build.after(async (b) => {
    if (b.kind !== 'full' || !ctx.settings.vault().syncCollection) return
    const collection = collectionPath(String(ctx.settings.vault().collection), ctx.vault.name, b.name)
    if (!collection) return
    // Not awaited: filling a collection must not make the build wait.
    void syncCollection({ zot, collection, auxPath: b.auxPath, cacheDir: ctx.cacheDir }).catch((e) => console.error('Zotero collection sync:', (e as Error).message))
  })
}

export default main
