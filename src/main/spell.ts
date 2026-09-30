// Spelling: the en-US Hunspell dictionary (dictionary-en) through nspell,
// plus the vault's own word list (words.txt, one word per line). The
// dictionary loads on first use (~0.5 s); checks are then fast.
// Suggestions take longer, so they're only made on request.
import { readFile, writeFile } from 'node:fs/promises'
import nspell from 'nspell'
import type { Vault } from './vault'

type Checker = ReturnType<typeof nspell>

let checker: Promise<Checker> | null = null
/** The vault words currently added to the checker, to take them out again on reload. */
let personal = new Set<string>()
let loadedFor: string | null = null

function dictionary(): Promise<Checker> {
  checker ??= import('dictionary-en').then(({ default: d }) => nspell(Buffer.from(d.aff), Buffer.from(d.dic)))
  return checker
}

/** The vault's word list, one word per line; '#' starts a comment. */
async function vaultWords(vault: Vault): Promise<string[]> {
  const text = await readFile(vault.abs(vault.words), 'utf8').catch(() => '')
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
}

/** (Re)reads the vault's word list into the checker. */
export async function reloadWords(vault: Vault): Promise<void> {
  const c = await dictionary()
  for (const w of personal) c.remove(w)
  personal = new Set(await vaultWords(vault))
  for (const w of personal) c.add(w)
  loadedFor = vault.root
}

async function ready(vault: Vault): Promise<Checker> {
  const c = await dictionary()
  if (loadedFor !== vault.root) await reloadWords(vault)
  return c
}

/** The words (from `words`) that are misspelled. */
export async function misspelled(vault: Vault, words: string[]): Promise<string[]> {
  const c = await ready(vault)
  return words.filter((w) => !c.correct(w))
}

export async function suggestions(vault: Vault, word: string): Promise<string[]> {
  return (await ready(vault)).suggest(word).slice(0, 6)
}

/** Adds `word` to the vault's word list (kept sorted) and to the checker. */
export async function addWord(vault: Vault, word: string): Promise<void> {
  const c = await ready(vault)
  const path = vault.abs(vault.words)
  const text = await readFile(path, 'utf8').catch(() => '')
  const lines = text.split(/\r?\n/).filter((l, i, all) => l.trim() || i < all.length - 1)
  if (!lines.some((l) => l.trim() === word)) {
    // Comment lines stay at the top; the words below them are sorted.
    const head = lines.filter((l) => l.trim().startsWith('#'))
    const words = [...lines.filter((l) => l.trim() && !l.trim().startsWith('#')), word].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    await writeFile(path, [...head, ...words].join(eol) + eol)
  }
  personal.add(word)
  c.add(word)
}
