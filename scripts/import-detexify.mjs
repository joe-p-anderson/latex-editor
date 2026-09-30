// Imports the symbol library and handwriting samples from Detexify Next
// (https://github.com/kirel/detexify-next, Daniel Kirsch) at a pinned
// commit, into src/renderer/src/assets/detexify/:
//   symbols.json      every symbol: command, package, math/text mode, its SVG
//   samples.json.gz   the handwriting samples the classifier compares against,
//                     as integer coordinates (0..1000), strokes flattened
//   NOTICE.md         where it came from and under which licences
//
//   node scripts/import-detexify.mjs [commit]
//
// Needs git and network access; the result is committed, so the app itself
// never downloads anything.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const COMMIT = process.argv[2] ?? 'ba0742b03b01a7a958110ced23d509a72d85744e'
const REPO = 'https://github.com/kirel/detexify-next.git'
const OUT = resolve(import.meta.dirname, '../src/renderer/src/assets/detexify')
const DATA = 'apps/web/public/data'

const work = mkdtempSync(join(tmpdir(), 'detexify-'))
const git = (...args) => execFileSync('git', args, { cwd: work, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
try {
  git('init', '-q')
  git('remote', 'add', 'origin', REPO)
  git('config', 'core.sparseCheckout', 'true')
  writeFileSync(join(work, '.git/info/sparse-checkout'), `${DATA}/\nLICENSE\n`)
  git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', COMMIT)
  git('checkout', '-q', 'FETCH_HEAD')

  const symbols = JSON.parse(readFileSync(join(work, DATA, 'symbols.json'), 'utf8'))
  const snapshot = JSON.parse(readFileSync(join(work, DATA, 'snapshot.json'), 'utf8'))

  // One file for the whole library. The SVGs are kept whole (they are shown
  // as images, so their glyph ids never clash), minus the XML prolog and
  // line breaks.
  const out = symbols.map((s) => ({
    id: s.id,
    command: s.command,
    package: s.package && s.package !== 'latex2e' ? s.package : null,
    fontenc: s.fontenc && s.fontenc !== 'OT1' ? s.fontenc : null,
    mode: s.mathmode && s.textmode ? 'both' : s.mathmode ? 'math' : 'text',
    // imagePath starts with data/.
    svg: readFileSync(join(work, 'apps/web/public', s.imagePath), 'utf8').replace(/<\?xml[^>]*\?>\s*/, '').replace(/\r?\n/g, ''),
  }))

  // Samples: symbol id → samples → strokes → [x0, y0, x1, y1, …] in thousandths.
  const samples = {}
  let count = 0
  for (const s of symbols) {
    const list = snapshot[s.legacyId] ?? snapshot[s.legacyId.replaceAll('\\', '_')] ?? []
    samples[s.id] = list.map((sample) => sample.strokes.map((stroke) => stroke.flatMap((p) => [Math.round(p.x * 1000), Math.round(p.y * 1000)])))
    count += list.length
  }

  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'symbols.json'), JSON.stringify(out))
  writeFileSync(join(OUT, 'samples.json.gz'), gzipSync(JSON.stringify(samples), { level: 9 }))
  writeFileSync(
    join(OUT, 'NOTICE.md'),
    [
      '# Detexify',
      '',
      `The symbol library (symbols.json), its images and the handwriting samples (samples.json.gz) come from Detexify Next by Daniel Kirsch, ${REPO.replace(/\.git$/, '')}, commit ${COMMIT}. Detexify is at https://detexify.kirelabs.org.`,
      '',
      'The classifier in src/shared/detexify.ts is a port of its legacy DTW classifier.',
      '',
      '- The code is under the MIT licence below.',
      '- The handwriting samples are the Detexify training data, published under the Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/. They are converted here to integer coordinates; nothing else is changed.',
      '',
      'Regenerate these files with `node scripts/import-detexify.mjs [commit]`.',
      '',
      '## MIT licence (Detexify Next)',
      '',
      '```',
      readFileSync(join(work, 'LICENSE'), 'utf8').trim(),
      '```',
      '',
    ].join('\n'),
  )
  console.log(`${out.length} symbols, ${count} samples → ${OUT}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
