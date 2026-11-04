// End to end: a vault opened through a Windows short path (C:\Users\JANDER~1\...).
// Preview builds name the main file by its full path on TeX's command line,
// where TeX reads `~` as a tie and stops ("LaTeX stopped", or no log at all).
// Needs MiKTeX: npm run test:e2e
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compileDraft } from '../src/main/compile'
import { Vault } from '../src/main/vault'

const DOC = '\\documentclass{article}\n\\begin{document}\nHello\n\\undefinedcmd\n\\end{document}\n'
// The temp folder is in short form only where the user folder has an 8.3 name.
const dir = mkdtempSync(join(tmpdir(), 'latex-editor-short-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe.runIf(dir.includes('~'))('a vault opened by its short path', () => {
  it('reports an error in a preview build at its file and line', async () => {
    writeFileSync(join(dir, 'main.tex'), DOC.replace('\\undefinedcmd\n', ''))
    const vault = new Vault(dir)
    await vault.load()
    const r = (await compileDraft(vault, 'main.tex', { 'main.tex': DOC }))!
    const errors = r.problems.filter((p) => p.severity === 'error' && !p.hidden)
    expect(errors.map((p) => [p.rule, p.file, p.line])).toEqual([['undefined-command', 'main.tex', 4]])
  })
})
