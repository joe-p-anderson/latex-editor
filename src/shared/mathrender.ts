// TeX → SVG with MathJax 3, plus the document's own macros and siunitx.
// Uses MathJax's lite DOM adaptor, which needs no browser, so the tests
// render exactly what the editor's preview renders.
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'
import { expandSiunitx } from './siunitx'

/** MathJax's macro format: body, or [body, argument count, default for an optional first argument]. */
export type MacroDefs = Record<string, string | [string, number] | [string, number, string]>

export interface Rendered {
  /** An <svg> element as markup (contains the error, in red, when there is one). */
  svg: string
  /** MathJax's error message, e.g. "Undefined control sequence \hatf", or null. */
  error: string | null
}

// Leave out the packages that hide mistakes: noundefined draws unknown
// commands as red text and noerrors shows the source instead of the error.
// A preview should say what is wrong.
const PACKAGES = AllPackages.filter((p) => p !== 'noundefined' && p !== 'noerrors')

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

/** A renderer for one set of macros. Creating one costs a few ms; reuse it. */
export function createRenderer(macros: MacroDefs = {}): (tex: string, display: boolean) => Rendered {
  const input = new TeX({ packages: PACKAGES, macros })
  const doc = mathjax.document('', {
    InputJax: input,
    OutputJax: new SVG({ fontCache: 'none' }),
  })
  const mathOnly = mathOnlyMacros(macros)
  return (tex, display) => {
    // Each formula on its own: MathJax otherwise remembers every \label it
    // has seen, and rendering an equation again (renumbered) would define it twice.
    input.reset()
    const node = doc.convert(ensureMathInText(expandSiunitx(tex), mathOnly), { display })
    // convert() returns an <mjx-container>; the preview only needs its <svg>.
    const svg = adaptor.firstChild(node) as never
    const markup = svg ? adaptor.outerHTML(svg) : adaptor.outerHTML(node)
    const err = /data-mjx-error="([^"]*)"/.exec(markup)?.[1] ?? null
    return { svg: markup, error: err && decodeEntities(err) }
  }
}

// Constructs MathJax only accepts in math mode, not inside \text{...}.
const MATH_ONLY_BODY = /\\(underline|overline|frac|dfrac|tfrac|sqrt|hat|vec|bar|dot|ddot|tilde|mathrm|mathbf|mathit|mathcal|operatorname|boldsymbol|left|right|sum|int|prod)(?![A-Za-z])|[_^]/

interface MacroShape {
  /** Braced arguments after the optional one. */
  args: number
  optional: boolean
}

/** Document macros whose bodies only work in math mode, with their argument shapes. */
function mathOnlyMacros(macros: MacroDefs): Map<string, MacroShape> {
  const out = new Map<string, MacroShape>()
  for (const [name, def] of Object.entries(macros)) {
    const [body, n = 0, dflt] = typeof def === 'string' ? [def] : def
    if (!MATH_ONLY_BODY.test(body)) continue
    const optional = dflt !== undefined
    out.set(name, { args: optional ? n - 1 : n, optional })
  }
  return out
}

/**
 * LaTeX's \ensuremath, done up front: a math-only document macro used inside
 * \text{...} (e.g. handout.cls's \blank, which is \underline{\hspace{..}})
 * gets its call wrapped in $...$, which MathJax's text mode understands.
 */
function ensureMathInText(tex: string, mathOnly: Map<string, MacroShape>): string {
  if (!mathOnly.size || !/\\(text|textrm|textbf|textit|mbox)\s*\{/.test(tex)) return tex
  let out = ''
  let i = 0
  let textDepth = 0 // brace depth inside the current \text{...}; 0 = not in text
  while (i < tex.length) {
    const rest = tex.slice(i)
    if (textDepth === 0) {
      const t = /^\\(?:text|textrm|textbf|textit|mbox)\s*\{/.exec(rest)
      if (t) { out += t[0]; i += t[0].length; textDepth = 1; continue }
      out += tex[i++]
      continue
    }
    const cmd = /^\\([A-Za-z]+)/.exec(rest)
    const shape = cmd && mathOnly.get(cmd[1])
    if (cmd && shape) {
      let j = i + cmd[0].length
      if (shape.optional) {
        const m = /^\s*\[[^\]]*\]/.exec(tex.slice(j))
        if (m) j += m[0].length
      }
      for (let k = 0; k < shape.args; k++) {
        const m = /^\s*\{[^{}]*\}/.exec(tex.slice(j))
        if (m) j += m[0].length
      }
      out += `$${tex.slice(i, j)}$`
      i = j
      continue
    }
    if (tex[i] === '\\') { out += tex.slice(i, i + 2); i += 2; continue }
    if (tex[i] === '{') textDepth++
    else if (tex[i] === '}') textDepth--
    out += tex[i++]
  }
  return out
}

function decodeEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
