// The document's own macros, for the math preview. MathJax knows standard
// LaTeX; this supplies what the document and its templates add, e.g.
// handout.cls's \blank or a preamble's \DeclareSIUnit{\solarmass}{...}.
//
// Read from the files the document actually loads: those in the last
// compile's log that live in the vault or the template library (MiKTeX's own
// packages are MathJax's job). Before a first compile: the document itself,
// its class from the template library, and the files it \inputs.
import { readFile } from 'node:fs/promises'
import { join, posix, resolve, sep } from 'node:path'
import type { MacroDefs } from '../shared/mathrender'
import { cacheDirFor } from './compile'
import { loadedFiles } from './macros'
import type { Vault } from './vault'

export async function macrosFor(vault: Vault, root: string): Promise<{ macros: MacroDefs; sources: string[] }> {
  const rootAbs = vault.abs(root)
  const name = posix.basename(root, '.tex')
  const log = await readFile(join(cacheDirFor(vault, root), `${name}.log`), 'utf8').catch(() => null)
  const ownFile = (p: string) => [vault.root, vault.templates].some((dir) => dir && (p === dir || p.startsWith(dir + sep)))

  let files: string[]
  if (log) {
    files = loadedFiles(log, vault.root).filter((f) => ownFile(f) && resolve(f) !== rootAbs)
  } else {
    files = await guessFiles(vault, rootAbs)
  }
  // The document's preamble comes after its class, so its definitions win.
  files.push(rootAbs)

  const macros: MacroDefs = {}
  const sources: string[] = []
  for (const f of files) {
    const text = await readFile(f, 'utf8').catch(() => null)
    if (text == null) continue
    const found = extractMacros(text)
    if (Object.keys(found).length) sources.push(vault.rel(f) ?? f)
    Object.assign(macros, found)
  }
  return { macros, sources }
}

async function guessFiles(vault: Vault, rootAbs: string): Promise<string[]> {
  const text = (await readFile(rootAbs, 'utf8').catch(() => '')).replace(/(?<!\\)%.*$/gm, '')
  const files: string[] = []
  const cls = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/.exec(text)?.[1]
  for (const dir of [vault.templates, vault.root]) {
    if (dir && cls) files.push(join(dir, `${cls}.cls`))
  }
  for (const m of text.matchAll(/\\(?:input|include)\{([^}]+)\}/g)) {
    files.push(vault.abs(m[1].endsWith('.tex') ? m[1] : `${m[1]}.tex`))
  }
  return files
}

/**
 * Macro definitions in `text`, in MathJax's format. Handles \newcommand and
 * friends (with argument counts and an optional-argument default),
 * \DeclareMathOperator, \DeclareSIUnit, simple \def and \let. Internal
 * (@) macros are skipped: they are class machinery, not something typed in math.
 */
export function extractMacros(text: string): MacroDefs {
  const src = text.replace(/(?<!\\)%.*$/gm, '')
  const out: MacroDefs = {}
  const add = (name: string, def: MacroDefs[string]) => {
    const body = typeof def === 'string' ? def : def[0]
    if (name.includes('@') || body.includes('@')) return
    out[name] = def
  }

  // \newcommand{\name}[n][default]{body}, \renewcommand, \providecommand, \DeclareRobustCommand
  const cmd = /\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))/g
  for (const m of src.matchAll(cmd)) {
    let i = m.index! + m[0].length
    const n = readBracket(src, i)
    if (n) i = n.end
    const dflt = n ? readBracket(src, i) : null
    if (dflt) i = dflt.end
    const body = readBraced(src, i)
    if (!body) continue
    const args = n ? Number(n.body) || 0 : 0
    add(m[1] ?? m[2], args ? (dflt ? [body.body, args, dflt.body] : [body.body, args]) : body.body)
  }

  // \DeclareMathOperator{\name}{text}; the starred form puts limits underneath.
  for (const m of src.matchAll(/\\DeclareMathOperator(\*?)\s*\{?\s*\\([A-Za-z]+)\s*\}?/g)) {
    const body = readBraced(src, m.index! + m[0].length)
    if (body) add(m[2], `\\operatorname${m[1]}{${body.body}}`)
  }

  // \DeclareSIUnit[options]{\name}{symbol}: a unit is just a macro to MathJax.
  for (const m of src.matchAll(/\\DeclareSIUnit\s*(?:\[[^\]]*\])?\s*\{?\s*\\([A-Za-z]+)\s*\}?/g)) {
    const body = readBraced(src, m.index! + m[0].length)
    if (body) add(m[1], body.body)
  }

  // \def\name#1#2{body} with undelimited parameters only.
  for (const m of src.matchAll(/\\[gex]?def\s*\\([A-Za-z@]+)((?:#\d)*)\s*(?=\{)/g)) {
    const body = readBraced(src, m.index! + m[0].length)
    if (!body) continue
    const args = (m[2].match(/#/g) ?? []).length
    add(m[1], args ? [body.body, args] : body.body)
  }

  // \let\new\old  or  \let\new=\old
  for (const m of src.matchAll(/\\let\s*\\([A-Za-z@]+)\s*=?\s*\\([A-Za-z@]+)/g)) {
    if (m[1] !== m[2] && m[2] !== 'relax' && m[2] !== 'undefined') add(m[1], `\\${m[2]}`)
  }
  return out
}

function readBraced(s: string, i: number): { body: string; end: number } | null {
  while (/\s/.test(s[i] ?? '')) i++
  if (s[i] !== '{') return null
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (s[j] === '{') depth++
    else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 }
  }
  return null
}

function readBracket(s: string, i: number): { body: string; end: number } | null {
  while (/\s/.test(s[i] ?? '')) i++
  if (s[i] !== '[') return null
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++
    else if (s[j] === '}') depth--
    else if (s[j] === ']' && depth === 0) return { body: s.slice(i + 1, j), end: j + 1 }
  }
  return null
}
