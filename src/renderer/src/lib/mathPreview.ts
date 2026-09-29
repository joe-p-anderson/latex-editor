// Live math preview for CodeMirror, Overleaf-style:
//  - with the cursor inside math, a rendered preview sits under the equation
//    and updates as you type;
//  - hovering any math shows the same preview.
// Errors (e.g. an undefined command) are shown under the rendering, and math
// that isn't closed yet previews up to the end of its paragraph.
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, hoverTooltip, showTooltip, tooltips, type Tooltip } from '@codemirror/view'
import { findMathRegions, regionAt, type MathRegion } from '@shared/mathregions'
import type { Rendered } from '@shared/mathrender'

export type RenderFn = (tex: string, display: boolean) => Rendered

/** Dispatch after the macros change, so an open preview re-renders. */
export const refreshMath = StateEffect.define<null>()

/**
 * `getRender` is read at render time, so swapping in a renderer built with
 * new macros (then dispatching refreshMath) updates every open editor state.
 */
export function mathPreview(getRender: () => RenderFn): Extension {
  // CodeMirror positions count each line break as one character, which is
  // exactly how doc.toString() joins lines, so offsets line up.
  const regions = StateField.define<MathRegion[]>({
    create: (state) => findMathRegions(state.doc.toString()),
    update: (value, tr) => (tr.docChanged ? findMathRegions(tr.newDoc.toString()) : value),
  })

  const underCursor = (state: EditorView['state']) => {
    const sel = state.selection.main
    return sel.empty ? regionAt(state.field(regions), sel.head) : undefined
  }

  const cursorTooltip = StateField.define<Tooltip | null>({
    create: () => null,
    update(value, tr) {
      if (!tr.docChanged && !tr.selection && !tr.effects.some((e) => e.is(refreshMath))) return value
      const r = underCursor(tr.state)
      if (!r || !r.tex.trim()) return null
      return { pos: anchor(tr.state, r), above: false, arrow: false, create: () => ({ dom: renderDom(getRender(), r) }) }
    },
    provide: (f) => showTooltip.from(f),
  })

  const hover = hoverTooltip((view, pos) => {
    const r = regionAt(view.state.field(regions), pos)
    // The cursor preview already shows this one.
    if (!r || !r.tex.trim() || r === underCursor(view.state)) return null
    return { pos: r.from, end: r.to, above: true, create: () => ({ dom: renderDom(getRender(), r) }) }
  })

  // Tooltips live on <body> so a wide equation isn't clipped at the editor's edge.
  return [regions, cursorTooltip, hover, tooltips({ parent: document.body }), theme]
}

/**
 * Where the cursor preview hangs: under the math's first character, so it
 * lines up with the equation; for a multi-line environment, under its
 * \end line instead, so it doesn't cover the equation being edited.
 */
function anchor(state: EditorView['state'], r: MathRegion): number {
  const first = state.doc.lineAt(r.from)
  const last = state.doc.lineAt(Math.min(r.to, state.doc.length))
  return first.number === last.number ? r.from : last.from
}

function renderDom(render: RenderFn, r: MathRegion): HTMLElement {
  const dom = document.createElement('div')
  dom.className = `cm-math-preview${r.display ? ' display' : ''}`
  let out: Rendered
  try {
    out = render(r.tex, r.display)
  } catch (e) {
    out = { svg: '', error: e instanceof Error ? e.message : String(e) }
  }
  // On an error MathJax replaces the whole expression with an error box that
  // needs its own stylesheet; the message below says it better.
  if (!out.error) {
    const math = document.createElement('div')
    math.className = 'cm-math-rendered'
    math.innerHTML = out.svg // MathJax output; links can't navigate (see main/index.ts)
    dom.append(math)
  }
  if (out.error) {
    const err = document.createElement('div')
    err.className = 'cm-math-error'
    err.textContent = out.error
    dom.append(err)
  }
  if (!r.closed) {
    const note = document.createElement('div')
    note.className = 'cm-math-note'
    note.textContent = 'Not closed yet: previewing to the end of the paragraph'
    dom.append(note)
  }
  return dom
}

const theme = EditorView.baseTheme({
  '.cm-tooltip.cm-math-preview': {
    border: '1px solid #d9dce1',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
  },
  '.cm-math-preview': {
    padding: '8px 12px',
    maxWidth: '640px',
    maxHeight: '320px',
    overflow: 'auto',
    fontSize: '18px', // MathJax sizes its SVG in ex, relative to this
    color: '#1f2328',
  },
  '.cm-math-preview.display .cm-math-rendered': { textAlign: 'center', minWidth: '120px' },
  '.cm-math-rendered svg': { maxWidth: 'none' },
  '.cm-math-error': {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: '13px',
    color: '#cf222e',
  },
  '.cm-math-rendered + .cm-math-error': {
    marginTop: '6px',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: '12px',
    color: '#cf222e',
  },
  '.cm-math-note': {
    marginTop: '4px',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: '11px',
    color: '#6a737d',
  },
})
