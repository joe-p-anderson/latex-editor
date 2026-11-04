// The LaTeX language for the editor: CodeMirror's legacy stex mode, with its
// tokens sorted into the three syntax roles (.scratch/ux-fixes/spec.md,
// "Syntax roles") that editorTheme.ts colours:
//   commands   \frac, \section, \alpha (also inside maths)
//   structure  environment names in \begin/\end; label, ref and cite keys
//   maths      the inside of $…$, \(…\), \[…\], $$…$$ and maths environments
// Braces and comments keep stex's own tags.
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { Tag, tags as t } from '@lezer/highlight'

export const roles = {
  command: t.macroName,
  structure: t.labelName,
  math: Tag.define(),
}

/** Environments whose body is maths. */
const MATH_ENV = /^(equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math|dmath|dgroup)\*?$/

// What stex keeps for itself (mode/stex.js): a stack of the commands whose
// arguments it is inside, each a "plugin" named after the command.
interface StexState {
  cmdState: { name: string }[]
}
interface State {
  inner: StexState
  /** Inside $…$, \(…\), \[…\] or $$…$$: stex tokenizes these itself. */
  math: boolean
  /** The maths environment we're inside (stex treats its body as text). */
  env: string | null
}

/** The innermost command whose arguments stex styles (\begin, \label, \cite…), if any. */
const argumentOf = (s: StexState) => [...s.cmdState].reverse().find((p) => p.name !== 'DEFAULT')?.name

const parser: StreamParser<State> = {
  name: 'latex',
  startState: (unit) => ({ inner: stex.startState!(unit) as StexState, math: false, env: null }),
  copyState: (s) => ({ inner: stex.copyState!(s.inner) as StexState, math: s.math, env: s.env }),
  blankLine(s, unit) {
    stex.blankLine!(s.inner, unit)
    s.math = false
    s.env = null
  },
  token(stream, s) {
    const style = stex.token(stream, s.inner)
    const text = stream.current()
    // stex marks only the maths delimiters as keywords: $, $$, \(, \), \[, \].
    if (style === 'keyword') {
      s.math = !s.math
      return 'math'
    }
    const inMath = s.math || s.env !== null
    if (style === 'tag') return /^\\[a-zA-Z@]/.test(text) || !inMath ? 'command' : 'math'
    if (style === 'atom') {
      const arg = argumentOf(s.inner)
      if (arg === 'begin' && !s.env && MATH_ENV.test(text)) s.env = text
      else if (arg === 'end' && text === s.env) s.env = null
      if (arg) return 'structure'
      // A number outside any argument.
      return inMath ? 'math' : null
    }
    if (inMath && style !== 'bracket' && style !== 'comment') return /\S/.test(text) ? 'math' : null
    return style
  },
  languageData: stex.languageData,
  tokenTable: { command: roles.command, structure: roles.structure, math: roles.math },
}

export const latex = StreamLanguage.define(parser)
