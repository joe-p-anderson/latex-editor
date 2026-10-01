// Live math preview for CodeMirror, Overleaf-style:
//  - with the cursor inside math, a rendered preview sits under the equation
//    and updates as you type;
//  - hovering any math shows the same preview.
// While typing, the preview keeps the last rendering that worked (faded)
// instead of flashing an error for half-typed math such as \hat{; errors, and
// math that isn't closed yet, are reported once typing pauses.
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, hoverTooltip, showTooltip, tooltips, type Tooltip } from '@codemirror/view'
import { findMathRegions, regionAt, type MathRegion } from '@shared/mathregions'
import type { Rendered } from '@shared/mathrender'
import { stablePreview, type LastGood, type Shown } from '@shared/mathstable'

export type RenderFn = (tex: string, display: boolean) => Rendered

/** Dispatch after the macros change, so an open preview re-renders. */
export const refreshMath = StateEffect.define<null>()

/** Typing has paused: time to report errors. */
const settle = StateEffect.define<null>()
const SETTLE_MS = 800

// Renderings by renderer, so a new set of macros starts a fresh cache.
const caches = new WeakMap<RenderFn, Map<string, Rendered>>()

/** `render`, never throwing, with recent results cached (live mode renders the same math over and over). */
export function cachedRender(render: RenderFn, tex: string, display: boolean): Rendered {
  let cache = caches.get(render)
  if (!cache) caches.set(render, (cache = new Map()))
  const key = (display ? 'D' : 'I') + tex
  let out = cache.get(key)
  if (!out) {
    try {
      out = render(tex, display)
    } catch (e) {
      out = { svg: '', error: e instanceof Error ? e.message : String(e) }
    }
    if (cache.size > 500) cache.delete(cache.keys().next().value!)
    cache.set(key, out)
  }
  return out
}

interface CursorPreview {
  tooltip: Tooltip | null
  last: LastGood | null
  settled: boolean
}

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

  const cursorPreview = StateField.define<CursorPreview>({
    create: () => ({ tooltip: null, last: null, settled: true }),
    update(value, tr) {
      const settledNow = tr.effects.some((e) => e.is(settle))
      if (!tr.docChanged && !tr.selection && !settledNow && !tr.effects.some((e) => e.is(refreshMath))) return value
      // Moving the cursor onto math shows its errors straight away; typing waits.
      const settled = tr.docChanged ? false : settledNow || !!tr.selection || value.settled
      let last = value.last && { from: tr.changes.mapPos(value.last.from), svg: value.last.svg }
      const r = underCursor(tr.state)
      if (!r || !r.tex.trim()) return { tooltip: null, last, settled }
      const out = cachedRender(getRender(), r.tex, r.display)
      const s = stablePreview(out, r.closed, r.from, last, settled)
      last = s.last
      const tooltip: Tooltip = { pos: anchor(tr.state, r), above: false, arrow: false, create: () => ({ dom: previewDom(s.shown, r.display) }) }
      return { tooltip, last, settled }
    },
    provide: (f) => showTooltip.from(f, (v) => v.tooltip),
  })

  // Tells cursorPreview when typing has paused.
  const settler = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined
      constructor(readonly view: EditorView) {}
      update(u: { docChanged: boolean }) {
        if (!u.docChanged) return
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.view.dispatch({ effects: settle.of(null) }), SETTLE_MS)
      }
      destroy() {
        clearTimeout(this.timer)
      }
    },
  )

  const hover = hoverTooltip((view, pos) => {
    const r = regionAt(view.state.field(regions), pos)
    // The cursor preview already shows this one.
    if (!r || !r.tex.trim() || r === underCursor(view.state)) return null
    const out = cachedRender(getRender(), r.tex, r.display)
    const shown: Shown = { svg: out.error ? null : out.svg, stale: false, error: out.error, unclosed: !r.closed }
    return { pos: r.from, end: r.to, above: true, create: () => ({ dom: previewDom(shown, r.display) }) }
  })

  // Tooltips live on <body> so a wide equation isn't clipped at the editor's edge.
  return [regions, cursorPreview, settler, hover, tooltips({ parent: document.body }), theme]
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

function previewDom(shown: Shown, display: boolean): HTMLElement {
  const dom = document.createElement('div')
  dom.className = `cm-math-preview${display ? ' display' : ''}`
  // On an error MathJax replaces the whole expression with an error box that
  // needs its own stylesheet; the message below says it better.
  if (shown.svg) {
    const math = document.createElement('div')
    math.className = `cm-math-rendered${shown.stale ? ' stale' : ''}`
    math.innerHTML = shown.svg // MathJax output; links can't navigate (see main/index.ts)
    dom.append(math)
  } else if (!shown.error) {
    const wait = document.createElement('div')
    wait.className = 'cm-math-note'
    wait.textContent = '…'
    dom.append(wait)
  }
  if (shown.error) {
    const err = document.createElement('div')
    err.className = 'cm-math-error'
    err.textContent = shown.error
    dom.append(err)
  }
  if (shown.unclosed) {
    const note = document.createElement('div')
    note.className = 'cm-math-note'
    note.textContent = 'Not closed yet: previewing to the end of the paragraph'
    dom.append(note)
  }
  return dom
}

const theme = EditorView.baseTheme({
  '.cm-tooltip.cm-math-preview': {
    border: '1px solid var(--line)',
    borderRadius: '6px',
    backgroundColor: 'var(--paper)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
  },
  '.cm-math-preview': {
    padding: '8px 12px',
    maxWidth: '640px',
    maxHeight: '320px',
    overflow: 'auto',
    fontSize: '18px', // MathJax sizes its SVG in ex, relative to this
    color: 'var(--ink)',
  },
  '.cm-math-preview.display .cm-math-rendered': { textAlign: 'center', minWidth: '120px' },
  '.cm-math-rendered svg': { maxWidth: 'none' },
  '.cm-math-rendered.stale': { opacity: '0.45' },
  '.cm-math-error': {
    fontFamily: 'var(--f-ui)',
    fontSize: '13px',
    color: 'var(--err)',
  },
  '.cm-math-rendered + .cm-math-error': {
    marginTop: '6px',
    fontFamily: 'var(--f-ui)',
    fontSize: '12px',
    color: 'var(--err)',
  },
  '.cm-math-note': {
    marginTop: '4px',
    fontFamily: 'var(--f-ui)',
    fontSize: '11px',
    color: 'var(--ink-soft)',
  },
})
