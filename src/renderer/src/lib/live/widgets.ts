// The things live mode draws in place of LaTeX source. Each widget's eq()
// compares what it shows, so CodeMirror reuses the DOM (and MathJax isn't
// rerun) when the document changes somewhere else.
import { EditorView, WidgetType } from '@codemirror/view'
import { inlineParts, type FrontPart, type ItemStyle, type Tabular } from '@shared/livemodel'
import { cachedRender, type RenderFn } from '../mathPreview'
import { thumbnail } from '../thumbnails'
import { OPEN_LOCATION_EVENT, type OpenLocation } from '../citations'
import { liveFile } from './live'

/** Clicking a widget puts the cursor where it is, which shows its source. */
function revealOnClick(dom: HTMLElement, view: EditorView, offset = 0): void {
  dom.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const pos = view.posAtDOM(dom) + offset
    view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) } })
    view.focus()
  })
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * A card's outer box. CodeMirror sizes a block widget by its border box, so
 * the card's own margins would go uncounted (and a run of cards leave the
 * page's inner margin short at the bottom). The box is its own formatting
 * context, so they count toward its height.
 */
function spaced(card: HTMLElement): HTMLElement {
  const box = el('div', 'cm-live-box')
  box.append(card)
  return box
}

const TAG_ICON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M1 7.8V2.5A1.5 1.5 0 0 1 2.5 1h5.3a1.5 1.5 0 0 1 1.06.44l5.7 5.7a1.5 1.5 0 0 1 0 2.12l-5.3 5.3a1.5 1.5 0 0 1-2.12 0l-5.7-5.7A1.5 1.5 0 0 1 1 7.8zM4.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>'
const LINK_ICON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M7.78 3.72a.75.75 0 0 1 0 1.06L5.56 7a1.75 1.75 0 0 0 2.47 2.47l.53-.53a.75.75 0 1 1 1.06 1.06l-.53.53a3.25 3.25 0 0 1-4.6-4.6l2.23-2.21a.75.75 0 0 1 1.06 0zm.44 8.56a.75.75 0 0 1 0-1.06L10.44 9a1.75 1.75 0 0 0-2.47-2.47l-.53.53a.75.75 0 1 1-1.06-1.06l.53-.53a3.25 3.25 0 0 1 4.6 4.6l-2.23 2.21a.75.75 0 0 1-1.06 0z"/></svg>'

export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly block: boolean,
    readonly render: RenderFn,
  ) {
    super()
  }
  eq(o: MathWidget): boolean {
    return o.tex === this.tex && o.display === this.display && o.block === this.block && o.render === this.render
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el(this.block ? 'div' : 'span', `cm-live-math${this.block ? ' block' : ''}${this.display ? ' display' : ''}`)
    const out = cachedRender(this.render, this.tex, this.display)
    if (out.error) {
      // Broken math shows as its source, marked, with the error on hover.
      dom.classList.add('error')
      dom.textContent = this.tex
      dom.title = out.error
    } else dom.innerHTML = out.svg // MathJax output
    revealOnClick(dom, view)
    return dom
  }
}

export class PreambleWidget extends WidgetType {
  constructor(
    readonly docclass: string | null,
    readonly packages: number,
    readonly macros: number,
  ) {
    super()
  }
  eq(o: PreambleWidget): boolean {
    return o.docclass === this.docclass && o.packages === this.packages && o.macros === this.macros
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('div', 'cm-live-preamble')
    const bits = [this.docclass ?? 'no \\documentclass', `${this.packages} package${this.packages === 1 ? '' : 's'}`]
    if (this.macros) bits.push(`${this.macros} macro${this.macros === 1 ? '' : 's'}`)
    dom.append(el('span', 'cm-live-preamble-icon', '⚙'), el('span', 'cm-live-preamble-title', 'Preamble'), el('span', 'cm-live-preamble-info', bits.join(' · ')))
    dom.title = 'Click to show the preamble'
    revealOnClick(dom, view)
    return spaced(dom)
  }
}

/** \today as LaTeX prints it. */
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

/**
 * The title block a run of \title, \author, \affiliation, … makes, laid out
 * as revtex does: the title, then each run of authors followed by their
 * affiliations, then the date. An author's email and other notes go in
 * small type under their name.
 */
export class FrontWidget extends WidgetType {
  constructor(
    readonly parts: FrontPart[],
    readonly render: RenderFn,
  ) {
    super()
  }
  eq(o: FrontWidget): boolean {
    return JSON.stringify(o.parts) === JSON.stringify(this.parts) && o.render === this.render
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('div', 'cm-live-front')
    // An author's \thanks is a footnote, not part of the name.
    const text = (tex: string) => richText(tex.replace(/\\thanks\s*\{[^{}]*\}/g, '').replace(/\\today(?![A-Za-z])/g, today()), this.render)
    const rich = (cls: string, tex: string) => {
      const row = el('div', cls)
      row.append(text(tex))
      return row
    }
    let authors: { names: HTMLElement; notes: HTMLElement } | null = null
    for (const p of this.parts) {
      switch (p.cmd) {
        case 'preprint':
          dom.prepend(rich('cm-live-front-preprint', p.arg))
          break
        case 'title':
          dom.append(rich('cm-live-front-title', p.arg))
          authors = null
          break
        case 'author':
        case 'collaboration': {
          if (!authors) {
            authors = { names: el('div', 'cm-live-front-authors'), notes: el('div', 'cm-live-front-notes') }
            dom.append(authors.names, authors.notes)
          } else authors.names.append(document.createTextNode(', '))
          authors.names.append(text(p.arg))
          break
        }
        case 'email':
        case 'homepage':
        case 'altaffiliation':
        case 'thanks': {
          const note = el('div', '')
          note.append(document.createTextNode(p.opt ?? (p.cmd === 'email' ? 'Email: ' : p.cmd === 'homepage' ? 'URL: ' : '')), text(p.arg))
          ;(authors?.notes ?? dom).append(note)
          break
        }
        case 'affiliation':
        case 'address':
          dom.append(rich('cm-live-front-aff', p.arg))
          authors = null
          break
        case 'date':
          dom.append(rich('cm-live-front-date', p.arg))
          authors = null
          break
        case 'keywords':
          dom.append(rich('cm-live-front-date', `Keywords: ${p.arg}`))
          break
      }
    }
    dom.title = 'Click to edit the title block'
    revealOnClick(dom, view)
    return spaced(dom)
  }
}

export class HeadingNumberWidget extends WidgetType {
  constructor(readonly number: string | null) {
    super()
  }
  eq(o: HeadingNumberWidget): boolean {
    return o.number === this.number
  }
  toDOM(): HTMLElement {
    return el('span', 'cm-live-hnum', this.number ?? '')
  }
}

export class FenceWidget extends WidgetType {
  constructor(
    readonly env: string,
    readonly begin: boolean,
  ) {
    super()
  }
  eq(o: FenceWidget): boolean {
    return o.env === this.env && o.begin === this.begin
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('span', `cm-live-fence-tag${this.begin ? '' : ' end'}`, this.begin ? this.env : `end ${this.env}`)
    revealOnClick(dom, view)
    return dom
  }
}

export class MarkerWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly style: ItemStyle,
    readonly points: string | null,
    readonly correct: boolean,
  ) {
    super()
  }
  eq(o: MarkerWidget): boolean {
    return o.label === this.label && o.style === this.style && o.points === this.points && o.correct === this.correct
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('span', `cm-live-marker ${this.style}${this.correct ? ' correct' : ''}`)
    dom.append(el('span', 'cm-live-marker-label', this.label))
    if (this.points) dom.append(el('span', 'cm-live-points', `${this.points} pt${this.points === '1' ? '' : 's'}`))
    revealOnClick(dom, view)
    return dom
  }
}

export class LabelWidget extends WidgetType {
  constructor(readonly key: string) {
    super()
  }
  eq(o: LabelWidget): boolean {
    return o.key === this.key
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('span', 'cm-live-chip label')
    dom.innerHTML = TAG_ICON
    dom.append(el('span', '', this.key))
    dom.title = `\\label{${this.key}}`
    revealOnClick(dom, view)
    return dom
  }
}

export class RefWidget extends WidgetType {
  constructor(
    readonly cmd: string,
    readonly keys: string[],
    readonly text: string | null,
    /** Where the (first) label is, for Ctrl+click. */
    readonly target: number | null,
    readonly targetLine: string | null,
    /** The label is in another file of the paper: there, for Ctrl+click. */
    readonly elsewhere: OpenLocation | null = null,
  ) {
    super()
  }
  eq(o: RefWidget): boolean {
    return (
      o.cmd === this.cmd &&
      o.text === this.text &&
      o.target === this.target &&
      o.keys.join() === this.keys.join() &&
      o.targetLine === this.targetLine &&
      o.elsewhere?.file === this.elsewhere?.file &&
      o.elsewhere?.line === this.elsewhere?.line
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('span', `cm-live-chip ref${this.text === null ? ' missing' : ''}`)
    dom.innerHTML = LINK_ICON
    dom.append(el('span', '', this.text ?? `?? ${this.keys.join(', ')}`))
    dom.title =
      this.text === null
        ? `No \\label{${this.keys.join(', ')}} found`
        : `\\${this.cmd}{${this.keys.join(', ')}}${this.elsewhere ? `\nIn ${this.elsewhere.file}, line ${this.elsewhere.line}` : ''}${this.targetLine ? `\n${this.targetLine}` : ''}${this.target !== null || this.elsewhere ? '\nCtrl+click to go there' : ''}`
    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      if ((e.ctrlKey || e.metaKey) && this.elsewhere) {
        view.dom.dispatchEvent(new CustomEvent<OpenLocation>(OPEN_LOCATION_EVENT, { bubbles: true, detail: this.elsewhere }))
        return
      }
      if ((e.ctrlKey || e.metaKey) && this.target !== null) {
        // Through the app, which remembers where it came from (Alt+Left goes back).
        const file = view.state.facet(liveFile)
        if (file) {
          const line = view.state.doc.lineAt(this.target).number
          view.dom.dispatchEvent(new CustomEvent<OpenLocation>(OPEN_LOCATION_EVENT, { bubbles: true, detail: { file, line } }))
          return
        }
        view.dispatch({ selection: { anchor: this.target }, effects: EditorView.scrollIntoView(this.target, { y: 'center' }) })
      } else view.dispatch({ selection: { anchor: view.posAtDOM(dom) } })
      view.focus()
    })
    return dom
  }
}

/**
 * A citation: the numbers the document prints ([3, 12]), or the keys until
 * a build has numbered them. Red when a key isn't in the bibliography.
 * The tooltip gives each entry; Ctrl+click opens the first in its .bib.
 */
export class CiteWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly missing: boolean,
    readonly tooltip: string,
    readonly location: OpenLocation | null,
  ) {
    super()
  }
  eq(o: CiteWidget): boolean {
    return o.text === this.text && o.missing === this.missing && o.tooltip === this.tooltip && o.location?.file === this.location?.file && o.location?.line === this.location?.line
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('span', `cm-live-chip cite${this.missing ? ' missing' : ''}`, this.text)
    dom.title = this.tooltip + (this.location ? '\nCtrl+click to open the entry' : '')
    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      if ((e.ctrlKey || e.metaKey) && this.location) {
        view.dom.dispatchEvent(new CustomEvent<OpenLocation>(OPEN_LOCATION_EVENT, { bubbles: true, detail: this.location }))
        return
      }
      view.dispatch({ selection: { anchor: view.posAtDOM(dom) } })
      view.focus()
    })
    return dom
  }
}

/** What an \input card shows: the file and the numbered headings in it. */
export interface IncludeCard {
  /** The file it brings in, vault-relative (or the argument, when it can't be resolved). */
  rel: string
  exists: boolean
  /** Commented out, so not part of the build. */
  off: boolean
  headings: { level: number; number: string | null; title: string }[]
}

/**
 * An \input (or \include, \import, …) in a paper's root: a card naming the
 * file, with its sections and their numbers. Clicking opens the file;
 * clicking the edge shows the source.
 */
export class IncludeWidget extends WidgetType {
  constructor(readonly card: IncludeCard) {
    super()
  }
  eq(o: IncludeWidget): boolean {
    return JSON.stringify(o.card) === JSON.stringify(this.card)
  }
  toDOM(view: EditorView): HTMLElement {
    const { rel, exists, off, headings } = this.card
    const dom = el('div', `cm-live-include${off ? ' off' : ''}${exists ? '' : ' missing'}`)
    const head = el('div', 'cm-live-include-head')
    head.append(el('span', 'cm-live-include-icon', '❧'), el('span', 'cm-live-include-file', rel.split('/').pop()!))
    if (off) head.append(el('span', 'cm-live-include-note', 'switched off'))
    else if (!exists) head.append(el('span', 'cm-live-include-note', 'not found'))
    dom.append(head)
    const top = Math.min(...headings.map((h) => h.level))
    for (const h of headings.slice(0, 12)) {
      const row = el('div', `cm-live-include-h l${h.level - top}`)
      if (h.number) row.append(el('span', 'cm-live-include-num', h.number))
      row.append(el('span', '', h.title))
      dom.append(row)
    }
    if (headings.length > 12) dom.append(el('div', 'cm-live-include-h more', `and ${headings.length - 12} more`))
    dom.title = exists ? `${rel}\nClick to open; Alt+click to edit the line` : `${rel} doesn't exist yet`
    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (exists && !e.altKey) {
        view.dom.dispatchEvent(new CustomEvent<OpenLocation>(OPEN_LOCATION_EVENT, { bubbles: true, detail: { file: rel, line: 1 } }))
        return
      }
      view.dispatch({ selection: { anchor: view.posAtDOM(dom) } })
      view.focus()
    })
    return spaced(dom)
  }
}

/**
 * At the top or foot of a file of a paper: the file before or after it in
 * reading order (Alt+PageUp, Alt+PageDown). Click to go there.
 */
export class NeighbourWidget extends WidgetType {
  constructor(
    readonly rel: string,
    readonly label: string | null,
    readonly next: boolean,
  ) {
    super()
  }
  eq(o: NeighbourWidget): boolean {
    return o.rel === this.rel && o.label === this.label && o.next === this.next
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('div', `cm-live-neighbour ${this.next ? 'next' : 'prev'}`)
    const name = this.rel.split('/').pop()!
    dom.append(
      el('span', 'cm-live-neighbour-dir', this.next ? 'Continue' : 'Before this'),
      el('span', 'cm-live-neighbour-file', `${this.next ? '' : '← '}${name}${this.label ? ` ${this.label}` : ''}${this.next ? ' →' : ''}`),
    )
    dom.title = `${this.rel} (${this.next ? 'Alt+PageDown' : 'Alt+PageUp'})`
    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      view.dom.dispatchEvent(new CustomEvent<OpenLocation>(OPEN_LOCATION_EVENT, { bubbles: true, detail: { file: this.rel, line: 1 } }))
    })
    return dom
  }
}

export class SymbolWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly faint: boolean,
  ) {
    super()
  }
  eq(o: SymbolWidget): boolean {
    return o.text === this.text && o.faint === this.faint
  }
  toDOM(): HTMLElement {
    return el('span', `cm-live-sym${this.faint ? ' faint' : ''}`, this.text)
  }
}

/** Caption or cell text: plain text, bold/italic, and inline math. */
export function richText(tex: string, render: RenderFn): HTMLElement {
  const dom = el('span', 'cm-live-rich')
  for (const part of inlineParts(tex)) {
    if (part.math) {
      const out = cachedRender(render, part.text, false)
      const m = el('span', 'cm-live-math')
      if (out.error) {
        m.classList.add('error')
        m.textContent = part.text
        m.title = out.error
      } else m.innerHTML = out.svg
      dom.append(m)
    } else if (part.style === 'bold') dom.append(el('strong', '', part.text))
    else if (part.style === 'italic') dom.append(el('em', '', part.text))
    else dom.append(document.createTextNode(part.text))
  }
  return dom
}

function imageDom(rel: string | null, arg: string, width: number): HTMLElement {
  const box = el('span', 'cm-live-img')
  if (!rel) {
    box.classList.add('missing')
    box.textContent = `Image not found: ${arg}`
    return box
  }
  box.textContent = rel
  thumbnail(rel, width).then((url) => {
    if (!url) {
      box.textContent = `${rel} (no preview for this format)`
      return
    }
    const img = document.createElement('img')
    img.src = url
    img.alt = rel
    box.replaceChildren(img)
  })
  return box
}

export class FigureWidget extends WidgetType {
  constructor(
    /** [as written, resolved in the vault or null] */
    readonly images: [string, string | null][],
    readonly caption: string | null,
    readonly number: string | null,
    readonly labels: string[],
    readonly render: RenderFn,
  ) {
    super()
  }
  eq(o: FigureWidget): boolean {
    return JSON.stringify([o.images, o.caption, o.number, o.labels]) === JSON.stringify([this.images, this.caption, this.number, this.labels]) && o.render === this.render
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('div', 'cm-live-figure')
    const imgs = el('div', 'cm-live-figure-images')
    for (const [arg, rel] of this.images) imgs.append(imageDom(rel, arg, 360))
    if (!this.images.length) imgs.append(el('span', 'cm-live-img missing', 'figure'))
    dom.append(imgs)
    if (this.caption !== null) {
      const cap = el('div', 'cm-live-caption')
      cap.append(el('strong', '', `Figure ${this.number}: `), richText(this.caption, this.render))
      dom.append(cap)
    }
    for (const key of this.labels) dom.append(new LabelWidget(key).toDOM(view))
    revealOnClick(dom, view, 0)
    return spaced(dom)
  }
}

/** Fired on the editor's DOM by a table's "Edit table" button; `detail` is the table's position. */
export const EDIT_TABLE_EVENT = 'latex-edit-table'

export class TableWidget extends WidgetType {
  constructor(
    readonly tabular: Tabular | null,
    readonly source: string,
    readonly caption: string | null,
    readonly number: string | null,
    readonly labels: string[],
    readonly render: RenderFn,
  ) {
    super()
  }
  eq(o: TableWidget): boolean {
    return o.source === this.source && o.number === this.number && o.render === this.render
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = el('div', 'cm-live-table')
    if (this.caption !== null) {
      const cap = el('div', 'cm-live-caption')
      cap.append(el('strong', '', `Table ${this.number}: `), richText(this.caption, this.render))
      dom.append(cap)
    }
    const t = this.tabular
    if (t) {
      const table = el('table', '')
      for (const [i, row] of t.rows.entries()) {
        const tr = el('tr', '')
        if (row.ruleAbove) tr.classList.add('rule-above')
        if (i === t.rows.length - 1 && t.ruleBelow) tr.classList.add('rule-below')
        let col = 0
        for (const cell of row.cells) {
          const td = el('td', `align-${cell.align}`)
          if (cell.span > 1) td.colSpan = cell.span
          if (t.vlines[col]) td.classList.add('vl')
          col += cell.span
          if (t.vlines[col] && col >= t.cols.length) td.classList.add('vr')
          td.append(richText(cell.tex, this.render))
          tr.append(td)
        }
        table.append(tr)
      }
      dom.append(table)
    } else dom.append(el('pre', 'cm-live-table-src', this.source))
    for (const key of this.labels) dom.append(new LabelWidget(key).toDOM(view))
    // Opens the table editor (Editor.svelte listens for the event). Its own
    // mousedown mustn't reach the table's, which would reveal the source.
    const edit = el('button', 'cm-live-table-edit', 'Edit table')
    edit.title = 'Edit this table in a grid (Ctrl+Alt+T with the cursor in it)'
    edit.addEventListener('mousedown', (e) => (e.preventDefault(), e.stopPropagation()))
    edit.addEventListener('click', () => view.dom.dispatchEvent(new CustomEvent(EDIT_TABLE_EVENT, { bubbles: true, detail: view.posAtDOM(dom) })))
    dom.append(edit)
    revealOnClick(dom, view)
    return spaced(dom)
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly arg: string,
    readonly rel: string | null,
    readonly block: boolean,
  ) {
    super()
  }
  eq(o: ImageWidget): boolean {
    return o.arg === this.arg && o.rel === this.rel && o.block === this.block
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = this.block ? el('div', 'cm-live-image block') : el('span', 'cm-live-image')
    dom.append(imageDom(this.rel, this.arg, 320))
    revealOnClick(dom, view)
    return dom
  }
}
