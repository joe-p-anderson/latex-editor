// Draws the Getting-started vault's figure, the period T against √L with a
// straight-line fit through the origin, as resources/getting-started/period.pdf.
// Plain TikZ (no pgfplots), built with pdflatex. Run: node scripts/make-getting-started-figure.mjs
// It prints the fitted slope and g, which main.tex quotes; change one, change the other.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Length L (m) and the period T (s), each the mean of three timings of ten swings.
const DATA = [
  [0.2, 0.903],
  [0.3, 1.095],
  [0.4, 1.278],
  [0.5, 1.422],
  [0.6, 1.547],
  [0.7, 1.689],
  [0.8, 1.798],
  [0.9, 1.915],
  [1.0, 2.014],
]
const DT = 0.02 // uncertainty in each T (s): reaction time over ten swings

// Least squares through the origin, T = m √L: m = Σ x T / Σ x², σm = DT / √Σx².
const xs = DATA.map(([L]) => Math.sqrt(L))
const sxx = xs.reduce((s, x) => s + x * x, 0)
const m = DATA.reduce((s, [, T], i) => s + xs[i] * T, 0) / sxx
const sm = DT / Math.sqrt(sxx)
const g = (2 * Math.PI / m) ** 2
const sg = 2 * g * (sm / m)
console.log(`slope ${m.toFixed(4)} ± ${sm.toFixed(4)} s/√m, g = ${g.toFixed(3)} ± ${sg.toFixed(3)} m/s²`)

// Plot coordinates: x = √L in [0.4, 1.05], y = T in [0.8, 2.1], drawn 7 cm by 5 cm.
const [x0, x1, y0, y1, W, H] = [0.4, 1.05, 0.8, 2.1, 7, 5]
const px = (x) => (((x - x0) / (x1 - x0)) * W).toFixed(3)
const py = (y) => (((y - y0) / (y1 - y0)) * H).toFixed(3)
const lines = []
for (const x of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
  lines.push(`\\draw (${px(x)},0) -- (${px(x)},-0.08) node[below] {\\small ${x.toFixed(1)}};`)
for (const y of [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0])
  lines.push(`\\draw (0,${py(y)}) -- (-0.08,${py(y)}) node[left] {\\small ${y.toFixed(1)}};`)
lines.push(`\\draw[thick] (${px(x0)},${py(m * x0)}) -- (${px(x1)},${py(m * x1)});`)
DATA.forEach(([, T], i) => {
  const [x, ylo, yhi, y] = [px(xs[i]), py(T - DT), py(T + DT), py(T)]
  lines.push(`\\draw (${x},${ylo}) -- (${x},${yhi}); \\draw (${x}-0.05,${ylo}) -- (${x}+0.05,${ylo}); \\draw (${x}-0.05,${yhi}) -- (${x}+0.05,${yhi});`)
  lines.push(`\\fill (${x},${y}) circle (1.6pt);`)
})

const tex = `\\documentclass[border=4pt]{standalone}
\\usepackage{tikz}
\\begin{document}
\\begin{tikzpicture}
\\draw (0,0) rectangle (${W},${H});
${lines.join('\n')}
\\node at (${W / 2},-0.85) {$\\sqrt{L}$ ($\\sqrt{\\mathrm{m}}$)};
\\node[rotate=90] at (-1.05,${H / 2}) {$T$ (s)};
\\end{tikzpicture}
\\end{document}
`

const work = mkdtempSync(join(tmpdir(), 'endleaf-figure-'))
try {
  writeFileSync(join(work, 'period.tex'), tex)
  execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'period.tex'], { cwd: work, stdio: 'ignore', env: { ...process.env, SOURCE_DATE_EPOCH: '0', FORCE_SOURCE_DATE: '1' } })
  const out = resolve(import.meta.dirname, '../resources/getting-started/period.pdf')
  copyFileSync(join(work, 'period.pdf'), out)
  console.log(`wrote ${out}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
