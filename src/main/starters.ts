import { readdir, readFile } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { splitHeader, type Starter } from '../shared/starters'
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

/** The built-in starters plus those in `starters/` under each template folder. */
export async function listStarters(vault: Vault): Promise<Starter[]> {
  const out: Starter[] = BUILT_IN.map((s, i) => ({ ...s, id: `built-in:${i}`, source: 'built-in' }))
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
  return out
}
