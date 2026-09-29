// Regenerates fixtures/errors/logs/*.log by compiling each deliberately
// broken document in fixtures/errors through the app's own pipeline.
// The parser tests read these logs, so they run without pdflatex.
//
//   npx vite-node scripts/gen-error-logs.ts
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { compile } from '../src/main/compile'
import { Vault } from '../src/main/vault'

const root = resolve(import.meta.dirname, '../fixtures/errors')
const vault = new Vault(root)
await vault.load()
await mkdir(join(root, 'logs'), { recursive: true })

for (const file of (await readdir(root)).filter((f) => /^\d+_.*\.tex$/.test(f)).sort()) {
  const r = await compile(vault, file)
  const name = file.replace(/\.tex$/, '')
  await copyFile(join(root, '.texcache', name, `${name}.log`), join(root, 'logs', `${name}.log`))
  const errors = r.problems.filter((p) => p.severity === 'error' && !p.hidden)
  console.log(`${file}: ${r.ok ? 'compiled cleanly' : `${errors.length} error(s), first: ${errors[0]?.title}`}, ${r.passes} pass(es)`)
}
