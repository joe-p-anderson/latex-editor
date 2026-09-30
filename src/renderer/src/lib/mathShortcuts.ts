// Math shortcuts in the editor: as you type inside math, a trigger such as
// `//`, `@a` or `xhat` expands (see @shared/mathsnippets). Backspace right
// after an expansion, while the cursor is still in what it inserted, puts
// back what was typed.
import { snippet } from '@codemirror/autocomplete'
import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { findMathRegions, mathAtCursor } from '@shared/mathregions'
import { inMathTextArg, matchAt, toCodeMirrorTemplate, type MathSnippet } from '@shared/mathsnippets'

interface Expansion {
  from: number
  to: number
  /** What was typed, trigger and all. */
  typed: string
}

const expanded = StateEffect.define<Expansion>()
const lastExpansion = StateField.define<Expansion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(expanded)) return e.value
    return tr.docChanged ? null : value
  },
})

export function mathShortcuts(snippets: () => MathSnippet[]): Extension {
  const input = EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || text.length !== 1 || view.state.selection.ranges.length > 1 || view.composing) return false
    // A letter straight after an expansion ending in a command (\to, \alpha)
    // would run into its name: \tob. Put a space between.
    const last = view.state.field(lastExpansion)
    if (last && last.to === from && /[A-Za-z]/.test(text) && /\\[A-Za-z]+$/.test(view.state.sliceDoc(last.from, last.to))) {
      view.dispatch({ changes: { from, insert: ' ' + text }, selection: { anchor: from + 2 }, userEvent: 'input.type' })
      return true
    }
    const line = view.state.doc.lineAt(from)
    const before = line.text.slice(Math.max(0, from - line.from - 60), from - line.from) + text
    const m = matchAt(before, snippets())
    if (!m) return false
    // Only in math, and not in \text{…}, \label{…} or a unit.
    const doc = view.state.doc.toString()
    const region = mathAtCursor(doc, findMathRegions(doc), from)
    if (!region || inMathTextArg(doc, from, region.from)) return false

    const start = from - (m.length - 1)
    const typed = view.state.sliceDoc(start, from) + text
    const lengthBefore = view.state.doc.length
    snippet(toCodeMirrorTemplate(m.template))(view, null, start, from)
    const end = start + (view.state.doc.length - (lengthBefore - (from - start)))
    view.dispatch({ effects: expanded.of({ from: start, to: end, typed }) })
    return true
  })

  const undoExpansion = (view: EditorView): boolean => {
    const last = view.state.field(lastExpansion)
    const sel = view.state.selection.main
    if (!last || !sel.empty || sel.head < last.from || sel.head > last.to) return false
    view.dispatch({
      changes: { from: last.from, to: last.to, insert: last.typed },
      selection: { anchor: last.from + last.typed.length },
      userEvent: 'delete.backward',
    })
    return true
  }

  return [lastExpansion, Prec.high(input), Prec.highest(keymap.of([{ key: 'Backspace', run: undoExpansion }]))]
}
