// Live mode: the document shown as it reads, not as it's written. Headings
// are headings, list markers are numbers and bullets, math and figures are
// rendered, labels and refs are chips. Whatever the cursor is in (a line for
// headings and list markers, the whole construct otherwise) shows as source
// again, so editing is always editing LaTeX. Nothing here changes the text.
//
// The parsing lives in @shared/livemodel; this file turns it into
// decorations. They come from a StateField rather than a ViewPlugin because
// CodeMirror only takes block widgets and line-spanning replacements from state.
import { Prec, StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, MatchDecorator, ViewPlugin, gutterLineClass, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSet } from '@codemirror/state'
import { isCite, liveModel, type LiveModel } from '@shared/livemodel'
import { entryText } from '@shared/bibtex'
import type { Citations } from '../citations'
import { resolveImage } from '../imageSupport'
import { refreshMath, type RenderFn } from '../mathPreview'
import { liveTheme } from './theme'
import {
  FenceWidget,
  CiteWidget,
  FigureWidget,
  HeadingNumberWidget,
  ImageWidget,
  LabelWidget,
  MarkerWidget,
  MathWidget,
  PreambleWidget,
  RefWidget,
  SymbolWidget,
  TableWidget,
} from './widgets'

export interface LiveHooks {
  /** The math renderer, with the document's macros. */
  render(): RenderFn
  /** The vault's images, for figures. */
  images(): string[]
  /** List environment → item command, without the backslash. */
  lists(): Record<string, string>
  /** The document's bibliography, for citation chips (null until loaded). */
  citations(): Citations | null
}

/** Turns live mode on or off for one editor state. */
export const setLive = StateEffect.define<boolean>()

/** Whether live mode is on in `state` (false if the extension isn't there). */
export function isLive(state: EditorState): boolean {
  return state.field(liveOn, false) ?? false
}

/** Flips live mode, as Ctrl+Shift+L does. */
export function toggleLive(view: EditorView): boolean {
  view.dispatch({ effects: setLive.of(!isLive(view.state)) })
  return true
}

const liveOn = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLive)) value = e.value
    return value
  },
})

const srcNumber = new (class extends GutterMarker {
  elementClass = 'cm-live-srcnum'
})()

/** Indent per list level, and the room a marker takes, in em. */
const LEVEL_EM = 1.6
const MARKER_EM = 2

/** `on` gives a new state's starting mode. */
export function liveMode(hooks: LiveHooks, on: () => boolean): Extension {
  const model = StateField.define<LiveModel | null>({
    create: (state) => (state.field(liveOn) ? liveModel(state.doc.toString(), hooks.lists()) : null),
    update(value, tr) {
      const live = tr.state.field(liveOn)
      if (!live) return null
      if (value && !tr.docChanged) return value
      return liveModel(tr.state.doc.toString(), hooks.lists())
    },
  })

  const decorations = StateField.define<DecorationSet>({
    create: (state) => build(state, state.field(model), hooks),
    update(value, tr) {
      const m = tr.state.field(model)
      if (m === tr.startState.field(model) && !tr.selection && !tr.effects.some((e) => e.is(refreshMath))) return value
      return build(tr.state, m, hooks)
    },
    provide: (f) => EditorView.decorations.from(f),
  })

  return [
    liveOn.init(on),
    model,
    decorations,
    // The source block's lines are numbered in the margin; other line numbers stay hidden in live mode.
    gutterLineClass.compute([decorations], (state) => {
      const marks: Range<GutterMarker>[] = []
      state.field(decorations).between(0, state.doc.length, (from, _to, deco) => {
        if (deco.spec.class === 'cm-live-src') marks.push(srcNumber.range(from))
      })
      return RangeSet.of(marks, true)
    }),
    spaces,
    EditorView.editorAttributes.compute([liveOn], (s) => (s.field(liveOn) ? { class: 'cm-live' } : ({} as Record<string, string>))),
    Prec.high(keymap.of([{ key: 'Mod-Shift-l', preventDefault: true, run: toggleLive }])),
    liveTheme,
  ]
}

function build(state: EditorState, model: LiveModel | null, hooks: LiveHooks): DecorationSet {
  if (!model) return Decoration.none
  const doc = state.doc
  const text = (from: number, to: number) => doc.sliceString(from, to)
  const sel = state.selection.ranges
  const out: Range<Decoration>[] = []
  const render = hooks.render()
  const touches = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from)
  const lineTouched = (pos: number) => {
    const l = doc.lineAt(pos)
    return touches(l.from, l.to)
  }
  const hide = (from: number, to: number) => from < to && out.push(Decoration.replace({}).range(from, to))
  const lineClass = (pos: number, cls: string) => out.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from))
  const tint = (from: number, to: number, cls: string) => {
    for (let l = doc.lineAt(from); ; l = doc.line(l.number + 1)) {
      out.push(Decoration.line({ class: cls }).range(l.from))
      if (l.to >= to || l.number === doc.lines) break
    }
  }
  /** from..to widened to whole lines, when nothing else shares those lines. */
  const wholeLines = (from: number, to: number) => {
    const a = doc.lineAt(from)
    const b = doc.lineAt(to)
    if (text(a.from, from).trim() || text(to, b.to).trim()) return null
    return { from: a.from, to: b.to }
  }
  /** A block widget over whole lines where possible, otherwise inline. */
  const widget = (from: number, to: number, make: (block: boolean) => import('@codemirror/view').WidgetType) => {
    const lines = wholeLines(from, to)
    if (lines) out.push(Decoration.replace({ widget: make(true), block: true }).range(lines.from, lines.to))
    else out.push(Decoration.replace({ widget: make(false) }).range(from, to))
  }

  // Lines inside lists: indented by level, markers hanging in the margin.
  const listDepth = new Map<number, number>()
  for (const b of model.lists) {
    if (b.to <= b.from) continue
    // Not the \begin and \end lines themselves (when they're on lines of their own).
    const a = doc.lineAt(b.from)
    const z = doc.lineAt(b.to)
    const first = a.number + (text(b.from, a.to).trim() ? 0 : 1)
    const last = z.number - (text(z.from, b.to).trim() ? 0 : 1)
    for (let n = first; n <= last; n++) listDepth.set(n, Math.max(listDepth.get(n) ?? 0, b.depth))
  }
  const itemLines = new Set<number>()
  const fenceLines = new Set<number>()
  for (const n of model.nodes) {
    const line = doc.lineAt(n.from)
    const firstOnLine = !text(line.from, n.from).trim()
    if (n.kind === 'item' && firstOnLine) itemLines.add(line.number)
    if (n.kind === 'fence' && firstOnLine && !text(n.to, line.to).trim()) fenceLines.add(line.number)
  }
  for (const [n, depth] of listDepth) {
    const line = doc.line(n)
    if (!line.text.trim()) continue
    const indent = (depth - 1) * LEVEL_EM + MARKER_EM
    const style = itemLines.has(n) ? `padding-left: ${indent}em; text-indent: -${MARKER_EM}em` : `padding-left: ${indent}em`
    out.push(Decoration.line({ attributes: { style } }).range(line.from))
    if (fenceLines.has(n)) continue // the fence hides its own indentation
    // The source's own indentation gives way to the padding, unless the cursor is in it.
    const ws = /^[ \t]*/.exec(line.text)![0].length
    if (ws && !sel.some((r) => r.head >= line.from && r.head < line.from + ws)) hide(line.from, line.from + ws)
  }

  for (const n of model.nodes) {
    switch (n.kind) {
      case 'preamble': {
        if (touches(n.from, n.to)) tint(n.from, n.to, 'cm-live-src')
        else widget(n.from, n.to, () => new PreambleWidget(n.docclass, n.packages, n.macros))
        break
      }
      case 'heading': {
        lineClass(n.from, `cm-live-h${n.level}`)
        if (n.openTo < 0 || lineTouched(n.from)) break
        out.push(Decoration.replace({ widget: new HeadingNumberWidget(n.number) }).range(n.from, n.openTo))
        hide(n.closeFrom, n.to)
        break
      }
      case 'fence': {
        const line = doc.lineAt(n.from)
        if (lineTouched(n.from)) break
        if (fenceLines.has(line.number)) {
          lineClass(n.from, 'cm-live-fence')
          hide(line.from, n.from)
        }
        out.push(Decoration.replace({ widget: new FenceWidget(n.env, n.begin) }).range(n.from, n.to))
        break
      }
      case 'item': {
        if (lineTouched(n.from)) break
        out.push(Decoration.replace({ widget: new MarkerWidget(n.label, n.style, n.points, n.correct) }).range(n.from, n.to))
        break
      }
      case 'math': {
        if (touches(n.from, n.to)) {
          if (n.display && wholeLines(n.from, n.to)) tint(n.from, n.to, 'cm-live-src')
          break
        }
        widget(n.from, n.to, (block) => new MathWidget(n.tex, n.display, block, render))
        break
      }
      case 'figure': {
        if (touches(n.from, n.to)) {
          tint(n.from, n.to, 'cm-live-src')
          break
        }
        const images = hooks.images()
        const resolved = n.images.map((a): [string, string | null] => [a, resolveImage(a, images)])
        widget(n.from, n.to, () => new FigureWidget(resolved, n.caption, n.number, n.labels, render))
        break
      }
      case 'table': {
        if (touches(n.from, n.to)) {
          tint(n.from, n.to, 'cm-live-src')
          break
        }
        widget(n.from, n.to, () => new TableWidget(n.tabular, text(n.from, n.to), n.caption, n.number, n.labels, render))
        break
      }
      case 'verbatim':
        tint(n.from, n.to, 'cm-live-code')
        break
      case 'image': {
        if (touches(n.from, n.to)) break
        const rel = resolveImage(n.path, hooks.images())
        widget(n.from, n.to, (block) => new ImageWidget(n.path, rel, block))
        break
      }
      case 'format': {
        out.push(Decoration.mark({ class: `cm-live-${n.cmd}` }).range(n.openTo, n.closeFrom))
        if (touches(n.from, n.to)) break
        hide(n.from, n.openTo)
        hide(n.closeFrom, n.to)
        break
      }
      case 'label': {
        if (touches(n.from, n.to)) break
        out.push(Decoration.replace({ widget: new LabelWidget(n.key) }).range(n.from, n.to))
        break
      }
      case 'ref': {
        if (touches(n.from, n.to)) break
        if (isCite(n.cmd)) {
          out.push(Decoration.replace({ widget: citeWidget(n.cmd, n.keys, hooks.citations()) }).range(n.from, n.to))
          break
        }
        const target = model.labels.get(n.keys[0])
        const targetLine = target ? doc.lineAt(target.pos).text.trim().slice(0, 80) : null
        out.push(Decoration.replace({ widget: new RefWidget(n.cmd, n.keys, n.text, target?.pos ?? null, targetLine) }).range(n.from, n.to))
        break
      }
      case 'symbol': {
        if (touches(n.from, n.to)) break
        out.push(Decoration.replace({ widget: new SymbolWidget(n.text, n.faint) }).range(n.from, n.to))
        break
      }
    }
  }
  return Decoration.set(out, true)
}

/**
 * What a citation shows: the labels the last build gave its keys ([3, 12]),
 * with the authors for \citet / \textcite and alone for \citeauthor, or the
 * keys themselves until a build has numbered them.
 */
function citeWidget(cmd: string, keys: string[], cites: Citations | null): CiteWidget {
  const entries = keys.map((k) => cites?.byKey.get(k))
  const labels = keys.map((k) => cites?.info.labels[k])
  // Only flagged once the bibliography has loaded (and has entries at all).
  const missing = !!cites?.info.entries.length && entries.some((e) => !e)
  const tooltip = keys.map((k, i) => (entries[i] ? `${labels[i] ? `[${labels[i]}] ` : ''}${entryText(entries[i]!)}` : `${k}: not in the bibliography`)).join('\n')
  const bracket = labels.every(Boolean) ? `[${labels.join(', ')}]` : `[${keys.join(', ')}]`
  let text = bracket
  const authors = entries.map((e, i) => e?.author || keys[i]).join(', ')
  if (/^(citet|textcite|Citet|Textcite)$/.test(cmd)) text = `${authors} ${bracket}`
  else if (/^[Cc]iteauthor$/.test(cmd)) text = authors
  else if (/^citeyear/.test(cmd)) text = entries.map((e, i) => e?.year || keys[i]).join(', ')
  else if (cmd === 'nocite') text = `nocite ${keys.join(', ')}`
  const first = entries.find(Boolean)
  return new CiteWidget(text, missing, tooltip, first ? { file: first.file, line: first.line } : null)
}

// Each space gets a faint dot, like an editor's "render whitespace", so the
// source's spacing stays visible in a proportional font.
const spaceMatcher = new MatchDecorator({ regexp: / /g, decoration: Decoration.mark({ class: 'cm-live-sp' }) })
const spaces = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = isLive(view.state) ? spaceMatcher.createDeco(view) : Decoration.none
    }
    update(u: ViewUpdate) {
      const live = isLive(u.state)
      if (live !== isLive(u.startState)) this.decorations = live ? spaceMatcher.createDeco(u.view) : Decoration.none
      else if (live) this.decorations = spaceMatcher.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)
