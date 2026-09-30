// LaTeX-aware brackets and quotes for the editor (the text logic is in
// @shared/pairs):
//  - typing: \left( adds \right), \{ adds \}, `` adds '', smart " quotes, …;
//  - Backspace inside an empty pair removes both halves;
//  - the cursor on \begin{x} or \end{x} (or a \left/\right) highlights its
//    partner, and Ctrl+Shift+\ jumps to it (or to the matching bracket).
import { cursorMatchingBracket } from '@codemirror/commands'
import { Prec, StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view'
import { envTokens, matchBegin, matchEnd, type EnvToken } from '@shared/latexedit'
import { leftRightPairs, pairContext, pairOnBackspace, pairOnInput, type LeftRight, type PairEdit } from '@shared/pairs'

/** Characters that can start a pairing rule; anything else is typed without a look. */
const INTERESTING = /^[()[\]{}|.`'"]$/

function applyPair(view: EditorView, pos: number, e: PairEdit, userEvent: string): void {
  const lb = view.state.lineBreak
  view.dispatch({
    changes: { from: pos + e.from, to: pos + e.to, insert: e.insert.replace(/\n/g, lb) },
    selection: { anchor: pos + e.from + e.cursor },
    scrollIntoView: true,
    userEvent,
  })
}

const input = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || text.length !== 1 || view.state.selection.ranges.length > 1 || view.composing) return false
  const line = view.state.doc.lineAt(from)
  const before = line.text.slice(0, from - line.from)
  const after = line.text.slice(from - line.from)
  // Letters matter only when they finish an opener like \langle.
  if (!INTERESTING.test(text) && !(/[a-zA-Z]/.test(text) && /\\l[a-zA-Z]*$/.test(before))) return false
  const e = pairOnInput(before, after, text, pairContext(view.state.doc.toString(), from))
  if (!e) return false
  applyPair(view, from, e, 'input.type')
  return true
})

function backspace(view: EditorView): boolean {
  const sel = view.state.selection.main
  if (!sel.empty || view.state.selection.ranges.length > 1) return false
  const line = view.state.doc.lineAt(sel.head)
  const e = pairOnBackspace(line.text.slice(0, sel.head - line.from), line.text.slice(sel.head - line.from))
  if (!e) return false
  applyPair(view, sel.head, e, 'delete.backward')
  return true
}

// --- Matching \begin/\end and \left/\right --------------------------------

interface Pairs {
  tokens: EnvToken[]
  leftRight: LeftRight[]
}
const pairs = StateField.define<Pairs>({
  create: (s) => scan(s),
  update: (v, tr) => (tr.docChanged ? scan(tr.state) : v),
})
function scan(state: EditorState): Pairs {
  const text = state.doc.toString()
  return { tokens: envTokens(text), leftRight: leftRightPairs(text) }
}

/** The token under the cursor and its partner, as [from, to] ranges; null when there's none. */
function partnerAt(state: EditorState, pos: number): { here: { from: number; to: number }; there: { from: number; to: number } } | null {
  const { tokens, leftRight } = state.field(pairs)
  const tok = tokens.find((t) => t.from <= pos && pos <= t.to)
  if (tok) {
    const other = tok.kind === 'begin' ? matchEnd(tokens, tok) : matchBegin(tokens, tok)
    return other ? { here: tok, there: other } : null
  }
  for (const p of leftRight) {
    if (p.open.from <= pos && pos <= p.open.to) return { here: p.open, there: p.close }
    if (p.close.from <= pos && pos <= p.close.to) return { here: p.close, there: p.open }
  }
  return null
}

const matchMark = Decoration.mark({ class: 'cm-matchingBracket' })
const highlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (!tr.docChanged && !tr.selection) return deco
    const sel = tr.state.selection.main
    const p = sel.empty ? partnerAt(tr.state, sel.head) : null
    if (!p) return Decoration.none
    const marks: Range<Decoration>[] = [p.here, p.there].sort((a, b) => a.from - b.from).map((r) => matchMark.range(r.from, r.to))
    return Decoration.set(marks)
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** Ctrl+Shift+\: to the partner of the \begin/\end or \left/\right under the cursor, else the matching bracket. */
function jump(view: EditorView): boolean {
  const p = partnerAt(view.state, view.state.selection.main.head)
  if (!p) return cursorMatchingBracket(view)
  view.dispatch({ selection: { anchor: p.there.from }, scrollIntoView: true })
  return true
}

export function latexPairs(): Extension {
  return [
    Prec.high(input),
    Prec.highest(keymap.of([{ key: 'Backspace', run: backspace }, { key: 'Mod-Shift-\\', preventDefault: true, run: jump }])),
    pairs,
    highlight,
  ]
}
