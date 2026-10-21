// Highlights the search sidebar's matches in the open file, and steps
// through them (Enter in the query box, F3 in the editor). The matching is
// the sidebar's own (src/shared/search.ts), so the highlights agree with its
// results: LaTeX-aware whole words, % comments skipped unless asked.

import { EditorSelection, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { searchText, type SearchOptions } from '@shared/search'

export type Find = { query: string; opts: SearchOptions }

/** Sets (or, with null, clears) what to highlight. */
export const setFind = StateEffect.define<Find | null>()

interface FindState {
  find: Find | null
  ranges: { from: number; to: number }[]
  deco: DecorationSet
}

const match = Decoration.mark({ class: 'cm-searchMatch' })
const selected = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' })

function ranges(state: EditorState, find: Find | null): { from: number; to: number }[] {
  if (!find?.query) return []
  return searchText(state.doc.toString(), find.query, find.opts).map((m) => ({ from: m.from, to: m.to }))
}

function decorate(state: EditorState, rs: { from: number; to: number }[]): DecorationSet {
  const sel = state.selection.main
  return Decoration.set(rs.map((r) => (r.from === sel.from && r.to === sel.to ? selected : match).range(r.from, r.to)))
}

const findField = StateField.define<FindState>({
  create: () => ({ find: null, ranges: [], deco: Decoration.none }),
  update(value, tr) {
    let { find } = value
    for (const e of tr.effects) if (e.is(setFind)) find = e.value
    const changed = find !== value.find || tr.docChanged
    if (!changed && !tr.selection) return value
    const rs = changed ? ranges(tr.state, find) : value.ranges
    return { find, ranges: rs, deco: decorate(tr.state, rs) }
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
})

export const findHighlight: Extension = findField

/** The query highlighted in `state`, if any. */
export const findOf = (state: EditorState): Find | null => state.field(findField, false)?.find ?? null

/**
 * Selects the next (dir 1) or previous (-1) highlighted match after or
 * before the selection, wrapping around unless `wrap` is false. Returns false
 * when there's no such match.
 */
export function stepFind(view: EditorView, dir: 1 | -1, wrap = true): boolean {
  const rs = view.state.field(findField, false)?.ranges ?? []
  if (!rs.length) return false
  const sel = view.state.selection.main
  let r = dir > 0 ? rs.find((m) => m.from >= sel.to && !(m.from === sel.from && m.to === sel.to)) : [...rs].reverse().find((m) => m.to <= sel.from)
  if (!r && wrap) r = dir > 0 ? rs[0] : rs[rs.length - 1]
  if (!r) return false
  view.dispatch({
    selection: EditorSelection.single(r.from, r.to),
    effects: EditorView.scrollIntoView(r.from, { y: 'center' }),
  })
  return true
}
