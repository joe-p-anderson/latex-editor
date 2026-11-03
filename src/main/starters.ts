import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { splitHeader, type Starter } from '../shared/starters'
import type { PluginManifest } from '../shared/plugin'
import type { Vault } from './vault'

const BUILT_IN: Omit<Starter, 'source' | 'id'>[] = [
  { name: 'Blank LaTeX file', ext: '.tex', description: 'An empty .tex file', text: '' },
  {
    name: 'Section',
    ext: '.tex',
    description: 'A section to \\input into a larger document',
    text: '\\section{{{Title}}}\n\\label{sec:{{basename}}}\n\n',
  },
  {
    name: 'Article',
    ext: '.tex',
    description: 'A complete article',
    text: `\\documentclass{article}

\\title{{{Title}}}
\\author{{{Author}}}
\\date{{{date}}}

\\begin{document}
\\maketitle

\\section{Introduction}

\\end{document}
`,
  },
  {
    name: 'Handout',
    ext: '.tex',
    description: 'A homework, lab or activity handout (needs handout.cls in your templates)',
    text: `\\documentclass{handout}

\\assignment{{{Assignment|Homework 1}}}
\\title{{{Title}}}
\\duedate{{{Due date}}}

\\begin{document}
\\maketitle

\\hwinstructions

\\begin{questions}
    \\question 
\\end{questions}

\\end{document}
`,
  },
  {
    name: 'Standalone figure',
    ext: '.tex',
    description: 'A figure that compiles on its own, cropped to its contents',
    text: `\\documentclass[border=4pt]{standalone}
\\usepackage{graphicx}

\\begin{document}
\\includegraphics{{{Image|image.png}}}
\\end{document}
`,
  },
  { name: 'Bibliography', ext: '.bib', description: 'A BibTeX database', text: '% References for {{basename}}\n\n' },
  { name: 'Markdown note', ext: '.md', description: 'A note', text: '# {{Title}}\n\n' },
  { name: 'Plain text', ext: '.txt', description: 'A text file', text: '' },
]

const EXTS = new Set(['.tex', '.bib', '.md', '.txt'])

/**
 * The built-in starters, those the vault's plugins ship (`plugins`), and those
 * in `starters/` under each template folder. A starter of the user's with a
 * plugin starter's name is used in its place.
 */
export async function listStarters(vault: Vault, plugins: PluginManifest[] = []): Promise<Starter[]> {
  const builtIn: Starter[] = BUILT_IN.map((s, i) => ({ ...s, id: `built-in:${i}`, source: 'built-in' }))
  const shipped: Starter[] = plugins.flatMap((m) =>
    (m.starters ?? []).map((s, i) => ({ ext: '.tex', ...s, id: `plugin:${m.id}:${i}`, source: 'built-in' as const })),
  )
  const out: Starter[] = []
  for (const dir of vault.templateDirs) {
    const source = dir === vault.globalTemplates ? 'global' : 'vault'
    const folder = join(dir, 'starters')
    const names = await readdir(folder).catch(() => [] as string[])
    for (const file of names.sort((a, b) => a.localeCompare(b))) {
      const ext = extname(file).toLowerCase()
      if (!EXTS.has(ext)) continue
      const raw = await readFile(join(folder, file), 'utf8').catch(() => null)
      if (raw == null) continue
      const { description } = splitHeader(raw)
      out.push({ id: `${source}:${file}`, name: basename(file, extname(file)), ext, description, source, text: raw })
    }
  }
  const own = new Set(out.map((s) => s.name.toLowerCase()))
  return [...builtIn, ...shipped.filter((s) => !own.has(s.name.toLowerCase())), ...out]
}

/**
 * The starters/ folder a starter from `source` lives in, made if missing: the
 * vault's for vault starters, the global one for global starters, and for the
 * built-in ones the vault's when it has a template folder, else the global one.
 */
export async function startersFolder(vault: Vault, source: Starter['source']): Promise<string | null> {
  const dir = source === 'global' ? vault.globalTemplates : (vault.vaultTemplates ?? vault.globalTemplates)
  if (!dir) return null
  const folder = join(dir, 'starters')
  await mkdir(folder, { recursive: true })
  return folder
}
