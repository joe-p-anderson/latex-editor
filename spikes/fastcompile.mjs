// Spike: two ways to make compiles faster, measured against MiKTeX.
//
//   1. Preamble format: dump the document's preamble into a .fmt with
//      mylatexformat, then start each compile from it.
//   2. Shadow compile: build unsaved editor buffers without writing them
//      into the vault, by running pdflatex from a folder holding only the
//      changed files, with the vault root on TEXINPUTS for everything else.
//
//   node spikes/fastcompile.mjs [vault] [document]
//
// Works on a temporary copy of the vault, so the fixtures are never touched.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, posix, resolve } from 'node:path'

const here = import.meta.dirname
const vaultSrc = resolve(process.argv[2] ?? join(here, '../fixtures/vaults/1200-latex'))
const doc = process.argv[3] ?? 'Homework/HW3_vectors.tex'
const templates = resolve(here, '../fixtures/_templates')

// The long form of the temp path: TeX chokes on the ~ of a Windows short name.
const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'fastcompile-')))
const vault = join(work, 'vault')
cpSync(vaultSrc, vault, { recursive: true, filter: (p) => !/[\\/](\.texcache|pdf)([\\/]|$)/.test(p) })

const name = posix.basename(doc, '.tex')
const cache = join(vault, '.texcache', posix.dirname(doc), name)
mkdirSync(cache, { recursive: true })
const texinputs = (...dirs) => dirs.map((d) => d + delimiter).join('')

function pdflatex(args, cwd, TEXINPUTS) {
  const t = performance.now()
  const r = spawnSync('pdflatex', args, { cwd, env: { ...process.env, TEXINPUTS }, encoding: 'utf8' })
  const ms = performance.now() - t
  const log = existsSync(join(cache, `${name}.log`)) ? readFileSync(join(cache, `${name}.log`), 'utf8') : ''
  const pages = /Output written on .*?\((\d+) pages?/.exec(log)?.[1] ?? '?'
  const errors = (log.match(/^(?:.+?:\d+: |! )/gm) ?? []).length
  return { ms: Math.round(ms), pages, errors, status: r.status, out: r.stdout }
}

const common = ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '-max-print-line=10000', `-aux-directory=${cache}`, `-output-directory=${cache}`]
const normalEnv = texinputs(`${templates}//`)
const report = (label, r) => console.log(`${label.padEnd(44)} ${String(r.ms).padStart(6)} ms  pages=${r.pages} errors=${r.errors} exit=${r.status}`)

// Warm up (MiKTeX may install packages, aux settles), then measure.
pdflatex([...common, doc], vault, normalEnv)
pdflatex([...common, doc], vault, normalEnv)
const base = []
for (let i = 0; i < 3; i++) base.push(pdflatex([...common, doc], vault, normalEnv))
base.forEach((r, i) => report(`plain pass ${i + 1}`, r))

// 1. Preamble format.
const fmtName = `${name}-preamble`
const dump = pdflatex(['-ini', '-interaction=nonstopmode', `-jobname=${fmtName}`, `-output-directory=${cache}`, '&pdflatex', 'mylatexformat.ltx', doc], vault, normalEnv)
report('build format', dump)
console.log('  format file exists:', existsSync(join(cache, `${fmtName}.fmt`)))

// Ways to load a format from an arbitrary folder.
const variants = {
  'fmt=<abs path>': [`-fmt=${join(cache, fmtName)}`],
  'undump=<name> + TEXFORMATS': [`-undump=${fmtName}`],
  '&<name> + TEXFORMATS': [`&${fmtName}`],
}
for (const [label, extra] of Object.entries(variants)) {
  const env = { ...process.env, TEXINPUTS: normalEnv, TEXFORMATS: cache + delimiter, MIKTEX_FORMATS: cache }
  const t = performance.now()
  const r = spawnSync('pdflatex', [...common, ...extra, doc], { cwd: vault, env, encoding: 'utf8' })
  const log = readFileSync(join(cache, `${name}.log`), 'utf8')
  const usedFmt = log.includes(fmtName) || /format=.*preamble/.test(log.split('\n')[0])
  console.log(`${('with format: ' + label).padEnd(44)} ${String(Math.round(performance.now() - t)).padStart(6)} ms  exit=${r.status} firstLine=${log.split('\n')[0].slice(0, 90)} usedFmt=${usedFmt}`)
}

// 2. Shadow compile: an edited copy of the document, nothing written to the vault.
const shadow = join(vault, '.texcache', '.shadow')
mkdirSync(join(shadow, posix.dirname(doc)), { recursive: true })
const edited = readFileSync(join(vault, doc), 'utf8').replace('\\begin{document}', '\\begin{document}\nSHADOWMARKER')
writeFileSync(join(shadow, doc), edited)
const sh = pdflatex([...common, doc], shadow, texinputs(shadow, vault, `${templates}//`))
report('shadow compile (cwd=shadow, vault on path)', sh)
if (sh.status !== 0) console.log(sh.out.split(/\r?\n/).slice(-8).join('\n'))
const shLog = readFileSync(join(cache, `${name}.log`), 'utf8')
const images = [...shLog.matchAll(/<([^<>]+\.(?:png|pdf|jpg))/g)].map((m) => m[1])
console.log('  images found:', images.length ? images.slice(0, 3) : 'none', '| missing-file errors:', /not found|File `.*' not found/.test(shLog))
const problems = shLog.split(/\r?\n/).filter((l) => /^!|^\S+:\d+: |Output written|not found|Emergency/.test(l))
console.log(problems.slice(0, 12).join('\n'))

writeFileSync(join(tmpdir(), 'shadow.log'), shLog)
rmSync(work, { recursive: true, force: true })
