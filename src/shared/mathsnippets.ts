// Math shortcuts: text that expands as you type, in math only. `//` becomes
// \frac{}{}, `@a` becomes \alpha, `xhat` becomes \hat{x}, `x1` becomes x_1.
// Backspace straight after an expansion puts back what was typed.
//
// The shortcuts are written one per line as
//     trigger => replacement
// A trigger is literal text, or a /regular expression/ whose groups the
// replacement uses as [[0]], [[1]], … In the replacement, $1, $2, … are
// places Tab moves between, and $0 is where the cursor ends up. A literal
// trigger that starts with a letter fires only at the start of a word (not
// after a letter or a backslash), so typing \sqrt never fires `sq`.
// `!trigger` turns a built-in off; `#` starts a comment.

export interface MathSnippet {
  trigger: string
  /** For a /regex/ trigger: the pattern, anchored at the cursor. */
  regex: RegExp | null
  replacement: string
}

export interface ParsedSnippets {
  snippets: MathSnippet[]
  /** Triggers switched off with !trigger. */
  disabled: string[]
  errors: { line: number; message: string }[]
}

export function parseMathSnippets(text: string): ParsedSnippets {
  const snippets: MathSnippet[] = []
  const disabled: string[] = []
  const errors: ParsedSnippets['errors'] = []
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('!')) {
      disabled.push(line.slice(1).trim())
      continue
    }
    const sep = line.indexOf(' => ', 1)
    if (sep < 0) {
      errors.push({ line: i + 1, message: 'Expected "trigger => replacement"' })
      continue
    }
    const trigger = line.slice(0, sep).trim()
    const replacement = line.slice(sep + 4).trim()
    let regex: RegExp | null = null
    if (trigger.length > 2 && trigger.startsWith('/') && trigger.endsWith('/')) {
      try {
        regex = new RegExp(`(?:${trigger.slice(1, -1)})$`)
      } catch (e) {
        errors.push({ line: i + 1, message: (e as Error).message })
        continue
      }
    }
    snippets.push({ trigger, regex, replacement })
  }
  return { snippets, disabled, errors }
}

/** The built-ins with the vault's file applied: same trigger replaces, !trigger removes, new ones are added. */
export function mergeSnippets(builtins: MathSnippet[], user: ParsedSnippets): MathSnippet[] {
  const byTrigger = new Map(builtins.map((s) => [s.trigger, s]))
  for (const t of user.disabled) byTrigger.delete(t)
  for (const s of user.snippets) byTrigger.set(s.trigger, s)
  return [...byTrigger.values()]
}

export interface SnippetMatch {
  /** How many characters before the cursor (the typed one included) it replaces. */
  length: number
  /** The replacement with regex groups filled in; $n still marks the tab stops. */
  template: string
}

/** The longest shortcut ending at the end of `before` (which includes the character just typed). */
export function matchAt(before: string, snippets: MathSnippet[]): SnippetMatch | null {
  let best: SnippetMatch | null = null
  for (const s of snippets) {
    let m: SnippetMatch | null = null
    if (s.regex) {
      const r = s.regex.exec(before)
      if (r && r[0].length) m = { length: r[0].length, template: s.replacement.replace(/\[\[(\d+)\]\]/g, (_, n) => r[Number(n) + 1] ?? '') }
    } else if (before.endsWith(s.trigger)) {
      const prev = before[before.length - s.trigger.length - 1] ?? ''
      if (/^[A-Za-z]/.test(s.trigger) && /[A-Za-z\\]/.test(prev)) continue
      if (prev === '\\') continue // \// or \-> are not shortcuts
      m = { length: s.trigger.length, template: s.replacement }
    }
    if (m && (!best || m.length > best.length)) best = m
  }
  return best
}

// Arguments inside math that aren't math to type in: \text{…}, labels, units.
const TEXT_ARGS =
  /\\(text|textrm|textit|textbf|textsf|texttt|mbox|mathrm|operatorname|label|ref|eqref|cref|Cref|tag|SI|si|qty|unit|num|ang|SIrange|qtyrange)\*?\s*(\[[^\]]*\])?\s*(\{[^{}]*\})?\s*$/

/** True when `pos` is inside the argument of \text, \label, \SI and the like (where shortcuts don't fire). */
export function inMathTextArg(text: string, pos: number, regionFrom: number): boolean {
  let depth = 0
  for (let i = pos - 1; i >= regionFrom; i--) {
    const c = text[i]
    if ((c !== '{' && c !== '}') || text[i - 1] === '\\') continue
    if (c === '}') depth++
    else if (depth > 0) depth--
    else if (TEXT_ARGS.test(text.slice(Math.max(regionFrom, i - 60), i))) return true
  }
  return false
}

/** The template in CodeMirror snippet syntax: $1 → ${1}, $0 → the last field. */
export function toCodeMirrorTemplate(template: string): string {
  return template.replace(/\$(\d)/g, (_, n: string) => (n === '0' ? '${99}' : `\${${n}}`))
}

// Greek letters follow vim-latex's long-standing layout (q theta, t tau,
// y psi, w omega, f phi, c chi), with @ in place of its backtick.
const GREEK: [string, string][] = [
  ['a', 'alpha'], ['b', 'beta'], ['g', 'gamma'], ['G', 'Gamma'], ['d', 'delta'], ['D', 'Delta'],
  ['e', 'epsilon'], ['ve', 'varepsilon'], ['z', 'zeta'], ['h', 'eta'], ['q', 'theta'], ['Q', 'Theta'],
  ['vq', 'vartheta'], ['i', 'iota'], ['k', 'kappa'], ['l', 'lambda'], ['L', 'Lambda'], ['m', 'mu'],
  ['n', 'nu'], ['x', 'xi'], ['X', 'Xi'], ['p', 'pi'], ['P', 'Pi'], ['r', 'rho'], ['s', 'sigma'],
  ['S', 'Sigma'], ['t', 'tau'], ['u', 'upsilon'], ['U', 'Upsilon'], ['f', 'phi'], ['F', 'Phi'],
  ['vf', 'varphi'], ['c', 'chi'], ['y', 'psi'], ['Y', 'Psi'], ['w', 'omega'], ['W', 'Omega'],
]

/** The built-in shortcuts, in the same format as the vault's file. */
export const DEFAULT_MATH_SNIPPETS = [
  '# Greek',
  ...GREEK.map(([k, name]) => `@${k} => \\${name}`),
  '',
  '# Fractions, roots and powers',
  '// => \\frac{$1}{$2}$0',
  'sq => \\sqrt{$1}$0',
  'sr => ^{2}',
  'cb => ^{3}',
  'td => ^{$1}$0',
  'invs => ^{-1}',
  'deg => ^\\circ',
  '',
  '# Accents: xhat → \\hat{x}; on their own they wait for the letter',
  '/(?<![\\\\A-Za-z])([A-Za-z])hat/ => \\hat{[[0]]}',
  '/(?<![\\\\A-Za-z])([A-Za-z])bar/ => \\bar{[[0]]}',
  '/(?<![\\\\A-Za-z])([A-Za-z])vec/ => \\vec{[[0]]}',
  '/(?<![\\\\A-Za-z])([A-Za-z])ddot/ => \\ddot{[[0]]}',
  '/(?<![\\\\A-Za-z])([A-Za-z])dot/ => \\dot{[[0]]}',
  '/(?<![\\\\A-Za-z])([A-Za-z])tilde/ => \\tilde{[[0]]}',
  'hat => \\hat{$1}$0',
  'bar => \\bar{$1}$0',
  'vec => \\vec{$1}$0',
  'dot => \\dot{$1}$0',
  'ddot => \\ddot{$1}$0',
  '',
  '# Relations and operators',
  '-> => \\to',
  '=> => \\implies',
  '<= => \\leq',
  '>= => \\geq',
  '!= => \\neq',
  '~~ => \\approx',
  '== => &=',
  '** => \\cdot',
  'xx => \\times',
  '+- => \\pm',
  '-+ => \\mp',
  '... => \\dots',
  'ooo => \\infty',
  'prop => \\propto',
  'par => \\partial',
  'del => \\nabla',
  '',
  '# Sums, integrals, limits and derivatives',
  'sum => \\sum_{$1}^{$2} $0',
  'int => \\int_{$1}^{$2} $3 \\,d$4',
  'lim => \\lim_{$1 \\to $2} $0',
  'ddt => \\frac{d}{dt}',
  'ddx => \\frac{d}{dx}',
  '',
  '# Text in math',
  'txt => \\text{$1}$0',
  '',
  '# Subscripts: x1 → x_1, then x_12 → x_{12}',
  '/(?<![A-Za-z\\\\\\d])([A-Za-z])(\\d)/ => [[0]]_[[1]]',
  '/(?<![A-Za-z\\\\])([A-Za-z])_(\\d\\d)/ => [[0]]_{[[1]]}',
].join('\n')

export const BUILTIN_MATH_SNIPPETS = parseMathSnippets(DEFAULT_MATH_SNIPPETS).snippets

/** A new vault file: how it works, with every built-in listed (commented out) to copy from. */
export function mathSnippetsFileTemplate(): string {
  return [
    '# Math shortcuts for this vault. They expand as you type, inside math only.',
    '# Backspace right after one puts back what you typed.',
    '#',
    '# One per line:   trigger => replacement',
    '#   $1, $2 … are places Tab moves between; $0 is where the cursor ends up.',
    '#   A /regex/ trigger can use its groups in the replacement as [[0]], [[1]] …',
    '#   A trigger starting with a letter fires only at the start of a word.',
    '#   !trigger turns a built-in shortcut off, e.g.   !xx',
    '#   A line here with the same trigger as a built-in replaces it.',
    '#',
    '# Examples:',
    '#   vv => \\vec{$1}$0',
    '#   !sr',
    '',
    '',
    '# ---- The built-in shortcuts, for reference ----',
    ...DEFAULT_MATH_SNIPPETS.split('\n').map((l) => (l ? `# ${l.replace(/^# /, '')}` : '#')),
    '',
  ].join('\n')
}
