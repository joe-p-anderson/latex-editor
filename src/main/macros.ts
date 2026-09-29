// Which commands and environments exist for a compiled document.
//
// Built from real definitions rather than a hand-kept list: the LaTeX kernel
// sources (latex.ltx, fontmath.ltx, fonttext.ltx, found with kpsewhich), plus
// every class, package and input file the log says was loaded, which covers
// handout.cls from the template library and the document's own \newcommands.
// Used to suggest "did you mean" for undefined commands and environments
// (and, later, to feed custom macros to the math preview).
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'

export interface Definitions {
  commands: Set<string> // without the backslash
  environments: Set<string>
}

// Primitives have no definition to scan. The ones people actually type.
const PRIMITIVES = `par relax hbox vbox vtop hskip vskip hfill vfill hss vss kern penalty
  noindent indent left right over atop above displaystyle textstyle scriptstyle
  scriptscriptstyle limits nolimits mathchoice mathop mathbin mathrel mathord mathpunct
  mathinner mathopen mathclose char number romannumeral uppercase lowercase string
  expandafter noexpand csname endcsname the showthe show message input endinput
  end dump special hrule vrule halign valign cr crcr omit span noalign mskip mkern
  unskip unpenalty lastskip vadjust insert mark discretionary accent mathaccent
  radical delimiter fi else if ifx ifnum ifdim ifcase or ifmmode ifvmode ifhmode
  global long outer def edef gdef xdef let futurelet chardef mathchardef countdef
  dimendef skipdef toksdef advance multiply divide count dimen skip toks box setbox
  wd ht dp raise lower moveleft moveright copy unhbox unvbox unhcopy unvcopy
  pdfpagewidth pdfpageheight pdfoutput`.split(/\s+/)

const COMMAND_DEF = [
  /\\(?:new|renew|provide)command\*?\s*\{?\s*\\([A-Za-z@]+)/g,
  /\\(?:DeclareRobustCommand|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|NewExpandableDocumentCommand|NewCommandCopy|DeclareMathOperator|DeclareMathSymbol|DeclareMathAccent|DeclareMathDelimiter|DeclareMathRadical|DeclareTextCommand|DeclareTextCommandDefault|DeclareTextSymbol|DeclareTextAccent|DeclareTextAccentDefault|DeclareTextCompositeCommand|DeclareOldFontCommand|DeclareSymbolFontAlphabet|DeclareMathAlphabet|newlength|newsavebox|newif)\*?\s*\{?\s*\\([A-Za-z@]+)/g,
  /\\(?:[gex]?def|let|chardef|mathchardef|countdef|dimendef|skipdef|toksdef|newcount|newdimen|newskip|newtoks|newbox)\s*\\([A-Za-z@]+)/g,
]
const ENV_DEF = [
  /\\(?:new|renew|provide)environment\*?\s*\{([^}]+)\}/g,
  /\\(?:NewDocumentEnvironment|RenewDocumentEnvironment|ProvideDocumentEnvironment|DeclareDocumentEnvironment)\s*\{([^}]+)\}/g,
  /\\newtheorem\*?\s*\{([^}]+)\}/g,
  // Plain-TeX style environments: \def\foo{...} \def\endfoo{...}
  /\\(?:[gex]?def|let)\s*\\end([A-Za-z]+)/g,
]

export function scanDefinitions(text: string): Definitions {
  const commands = new Set<string>()
  const environments = new Set<string>()
  for (const re of COMMAND_DEF) for (const m of text.matchAll(re)) commands.add(m[1])
  for (const re of ENV_DEF) for (const m of text.matchAll(re)) environments.add(m[1].trim())
  // \newif\iffoo also defines \footrue and \foofalse.
  for (const m of text.matchAll(/\\newif\s*\\if([A-Za-z@]+)/g)) commands.add(`${m[1]}true`).add(`${m[1]}false`)
  // \newcounter{foo} defines \thefoo.
  for (const m of text.matchAll(/\\newcounter\s*\{([^}]+)\}/g)) commands.add(`the${m[1]}`)
  return { commands, environments }
}

/** Every class, package and .tex file the log shows TeX opening. */
export function loadedFiles(log: string, cwd: string): string[] {
  const out = new Set<string>()
  for (const m of log.matchAll(/\(((?:[A-Za-z]:)?[^\s(){}<>"]*\.(?:sty|cls|def|cfg|clo|ldf|tex))(?=[\s)]|$)/gm)) {
    out.add(isAbsolute(m[1]) ? m[1] : resolve(cwd, m[1]))
  }
  return [...out]
}

// Parsed files, keyed by path and invalidated by mtime.
const cache = new Map<string, { mtime: number; defs: Definitions }>()

async function definitionsOf(path: string): Promise<Definitions | null> {
  const s = await stat(path).catch(() => null)
  if (!s) return null
  const hit = cache.get(path)
  if (hit && hit.mtime === s.mtimeMs) return hit.defs
  const defs = scanDefinitions(await readFile(path, 'latin1'))
  cache.set(path, { mtime: s.mtimeMs, defs })
  return defs
}

let kernelFiles: Promise<string[]> | null = null
function findKernel(): Promise<string[]> {
  kernelFiles ??= promisify(execFile)('kpsewhich', ['latex.ltx', 'fontmath.ltx', 'fonttext.ltx'], { windowsHide: true })
    .then(({ stdout }) => stdout.split(/\r?\n/).filter(Boolean))
    .catch(() => [])
  return kernelFiles
}

/** Everything defined for a document: kernel + primitives + the files in its log. */
export async function definitionsFor(log: string, cwd: string): Promise<Definitions> {
  const commands = new Set(PRIMITIVES)
  const environments = new Set<string>()
  const files = [...(await findKernel()), ...loadedFiles(log, cwd)]
  for (const defs of await Promise.all(files.map(definitionsOf))) {
    if (!defs) continue
    for (const c of defs.commands) commands.add(c)
    for (const e of defs.environments) environments.add(e)
  }
  return { commands, environments }
}

/** Damerau-Levenshtein distance (optimal string alignment). */
export function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/**
 * The closest names to `name`, best first. Internal names (with @) are only
 * offered when `name` has one too. Names up to 5 characters allow one edit
 * (\vect → \vec), longer ones two (\ansewrspace → \answerspace); one- and
 * two-character names get no suggestions, since everything is one edit away.
 */
export function closest(name: string, candidates: Iterable<string>, limit = 3): string[] {
  if (name.length <= 2) return []
  const max = name.length <= 5 ? 1 : 2
  const allowAt = name.includes('@')
  const scored: { c: string; d: number }[] = []
  for (const c of candidates) {
    if (c === name || (!allowAt && c.includes('@'))) continue
    if (Math.abs(c.length - name.length) > max) continue
    const d = distance(name, c)
    if (d <= max) scored.push({ c, d })
  }
  // Ties: prefer a shared prefix, then the shorter name.
  const prefix = (c: string) => { let k = 0; while (k < c.length && k < name.length && c[k] === name[k]) k++; return k }
  scored.sort((x, y) => x.d - y.d || prefix(y.c) - prefix(x.c) || x.c.length - y.c.length)
  // Only the closest tier: one clear answer beats a list of weaker ones.
  return scored.filter((s) => s.d === scored[0].d).slice(0, limit).map((s) => s.c)
}
