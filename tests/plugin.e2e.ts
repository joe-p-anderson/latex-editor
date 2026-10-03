// End to end for the plugin engine's scratch builds (ctx.build.scratch).
// Needs MiKTeX: npx vitest run --project e2e tests/plugin.e2e.ts
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { compileScratch } from '../src/main/compile'
import { Vault } from '../src/main/vault'

// A ~ in the vault's path, as in a Windows short name (JANDER~1): TeX can't read
// an absolute path with one, so the scratch document must be named relative to the vault.
const dir = mkdtempSync(join(tmpdir(), 'plugin-scratch-'))
const root = join(dir, 'SHORT~1', 'vault')
mkdirSync(root, { recursive: true })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

it('builds a scratch document in a vault whose path has a ~', async () => {
  const vault = new Vault(root)
  await vault.load()
  const r = await compileScratch(vault, join(root, '.texcache', 'plugins', 'demo'), 'check', '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n')
  expect(r.problems.filter((p) => p.severity === 'error')).toEqual([])
  expect(r.ok).toBe(true)
  expect(r.pdf).toBeTruthy()
})
