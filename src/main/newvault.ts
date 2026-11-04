// New vault…: what happens after the folder picker. A folder that already
// holds .tex files opens as it is; any other is set up from a starter, with
// main.tex to begin on (onboarding spec, "New vault flow").
import { mkdir, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { PALETTES } from '../shared/appearance'
import { defaultStarter, type Starter } from '../shared/starters'
import { listStarters, writeStarter } from './starters'
import { Vault } from './vault'

// Folders whose .tex files don't make a folder a vault already.
const SKIP = new Set(['.texcache', '.git', 'node_modules', '.venv', '.vscode', 'build'])

/** Whether `root`, or a folder under it, holds a .tex file (false when `root` doesn't exist). */
export async function holdsTex(root: string): Promise<boolean> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const e of entries) if (e.isFile() && e.name.toLowerCase().endsWith('.tex')) return true
  for (const e of entries) if (e.isDirectory() && !SKIP.has(e.name) && (await holdsTex(join(root, e.name)))) return true
  return false
}

export interface NewVaultChoices {
  /** The folder's name, the vault's name unless changed. */
  name: string
  /** The .tex starters main.tex can come from. */
  starters: Starter[]
  /** The id of the starter to preselect: the app-wide default's. */
  preselect: string | null
}

/** The .tex starters a vault at `root` could begin from (its folder needn't exist yet). */
async function texStarters(root: string, globalTemplates: string | null): Promise<Starter[]> {
  return (await listStarters(new Vault(root, globalTemplates))).filter((s) => s.ext === '.tex')
}

/** What the New vault dialog offers for `root`. Writes nothing. */
export async function newVaultChoices(root: string, globalTemplates: string | null, appDefault: string): Promise<NewVaultChoices> {
  const starters = await texStarters(root, globalTemplates)
  return { name: basename(resolve(root)), starters, preselect: defaultStarter(starters, null, appDefault)?.id ?? null }
}

/**
 * Sets up a vault at `root` (made if missing): .vault.json with its name, the
 * starter as its default and a random palette, then main.tex from the starter
 * (a folder starter's entry file) and a folder starter's other files, each
 * only if missing, their fields left at their defaults, the Title being the
 * vault's name. Returns main.tex's vault-relative path.
 */
export async function makeVault(root: string, choice: { name: string; starter: string }, globalTemplates: string | null): Promise<string> {
  const starter = (await texStarters(root, globalTemplates)).find((s) => s.id === choice.starter)
  if (!starter) throw new Error('That starter is no longer there')
  await mkdir(root, { recursive: true })
  const vault = new Vault(root, globalTemplates)
  await vault.load()
  await vault.saveName(choice.name)
  await vault.saveDefaultStarter(starter.name)
  await vault.saveAppearance({ palette: PALETTES[Math.floor(Math.random() * PALETTES.length)] })
  const main = 'main.tex'
  const date = new Date().toISOString().slice(0, 10)
  await writeStarter(vault, main, starter, { Title: vault.name }, { date, filename: main, basename: 'main' })
  return main
}
