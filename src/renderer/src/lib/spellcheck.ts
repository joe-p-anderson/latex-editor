// Spelling in the editor: misspelled words in the prose (see
// @shared/spellwords) get a wavy underline. Right-click one, or press
// Ctrl+. with the cursor in it, for suggestions, "Add to words.txt" and
// "Ignore". The checking itself happens in the main process.
import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, showTooltip, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view'
import { proseWords, type ProseWord } from '@shared/spellwords'

export interface SpellHooks {
  enabled(): boolean
  check(words: string[]): Promise<string[]>
  suggest(word: string): Promise<string[]>
  add(word: string): Promise<void>
}

/** Recheck and redraw (after spelling was switched on or off, or a word added). */
export const refreshSpelling = StateEffect.define<null>()

// Answers per word, shared by every open file; words ignored this session.
const known = new Map<string, boolean>()
const ignored = new Set<string>()

/** Forgets cached answers (the vault's word list changed). */
export function clearSpellingCache(): void {
  known.clear()
}

const bad = Decoration.mark({ class: 'cm-misspelled' })
const isBad = (w: string) => known.get(w) === true && !ignored.has(w)

// --- The suggestions menu ---------------------------------------------------

interface MenuState {
  word: ProseWord
  suggestions: string[] | null
}
const openMenu = StateEffect.define<MenuState>()
const closeMenu = StateEffect.define<null>()

function menuField(hooks: SpellHooks) {
  return StateField.define<MenuState | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(openMenu)) return e.value
        if (e.is(closeMenu)) return null
      }
      if (!value) return value
      // Right-clicking also puts the cursor in the word, so the menu stays
      // open while the cursor is in it; an edit or moving away closes it.
      const head = tr.state.selection.main.head
      if (tr.docChanged || (tr.selection && (head < value.word.from || head > value.word.to))) return null
      return value
    },
    provide: (f) =>
      showTooltip.from(f, (m): Tooltip | null =>
        m
          ? {
              pos: m.word.from,
              above: false,
              create: (view) => ({ dom: menuDom(view, m, hooks) }),
            }
          : null,
      ),
  })
}

function menuDom(view: EditorView, m: MenuState, hooks: SpellHooks): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-spell-menu'
  const item = (label: string, cls: string, run: () => void) => {
    const b = document.createElement('button')
    b.className = cls
    b.textContent = label
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', () => {
      run()
      view.focus()
    })
    dom.append(b)
  }
  if (m.suggestions === null) {
    const wait = document.createElement('div')
    wait.className = 'cm-spell-note'
    wait.textContent = 'Looking for suggestions…'
    dom.append(wait)
  } else if (!m.suggestions.length) {
    const none = document.createElement('div')
    none.className = 'cm-spell-note'
    none.textContent = 'No suggestions'
    dom.append(none)
  }
  for (const s of m.suggestions ?? []) {
    item(s, 'cm-spell-suggestion', () => view.dispatch({ changes: { from: m.word.from, to: m.word.to, insert: s }, selection: { anchor: m.word.from + s.length } }))
  }
  const sep = document.createElement('hr')
  dom.append(sep)
  item(`Add “${m.word.word}” to words.txt`, '', () => {
    hooks.add(m.word.word).then(() => {
      known.set(m.word.word, false)
      view.dispatch({ effects: refreshSpelling.of(null) })
    })
    view.dispatch({ effects: closeMenu.of(null) })
  })
  item('Ignore', '', () => {
    ignored.add(m.word.word)
    view.dispatch({ effects: [closeMenu.of(null), refreshSpelling.of(null)] })
  })
  return dom
}

// --- Checking and underlining -----------------------------------------------

export function spellcheck(hooks: SpellHooks): Extension {
  const menu = menuField(hooks)

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      words: ProseWord[] = []
      timer: ReturnType<typeof setTimeout> | undefined
      seq = 0

      constructor(readonly view: EditorView) {
        this.schedule(0)
      }

      update(u: ViewUpdate) {
        const refresh = u.transactions.some((t) => t.effects.some((e) => e.is(refreshSpelling)))
        if (u.docChanged) {
          // Keep the underlines where they are until the next check.
          this.decorations = this.decorations.map(u.changes)
          this.words = this.words.map((w) => ({ ...w, from: u.changes.mapPos(w.from, 1), to: u.changes.mapPos(w.to, -1) }))
          this.schedule(400)
        } else if (refresh) this.schedule(0)
        else if (u.viewportChanged) this.decorations = this.build()
      }

      schedule(delay: number) {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.check(), delay)
      }

      async check() {
        const seq = ++this.seq
        if (!hooks.enabled()) {
          this.words = []
          this.decorations = Decoration.none
          this.view.dispatch({})
          return
        }
        const words = proseWords(this.view.state.doc.toString())
        const unknown = [...new Set(words.map((w) => w.word).filter((w) => !known.has(w)))]
        if (unknown.length) {
          const wrong = new Set(await hooks.check(unknown).catch(() => [] as string[]))
          for (const w of unknown) known.set(w, wrong.has(w))
        }
        if (seq !== this.seq) return
        this.words = words
        this.decorations = this.build()
        this.view.dispatch({}) // redraw with the new decorations
      }

      /** Underlines for the misspelled words in the visible part of the document. */
      build(): DecorationSet {
        const marks: Range<Decoration>[] = []
        for (const { from, to } of this.view.visibleRanges) {
          for (const w of this.words) {
            if (w.to < from || w.from > to || w.to <= w.from) continue
            if (isBad(w.word)) marks.push(bad.range(w.from, w.to))
          }
        }
        return Decoration.set(marks, true)
      }

      destroy() {
        clearTimeout(this.timer)
      }
    },
    { decorations: (p) => p.decorations },
  )

  /** Opens the menu for the misspelled word at `pos`, then fills in suggestions. */
  const openAt = (view: EditorView, pos: number): boolean => {
    const p = view.plugin(plugin)
    const word = p?.words.find((w) => w.from <= pos && pos <= w.to && isBad(w.word))
    if (!word) return false
    view.dispatch({ effects: openMenu.of({ word, suggestions: null }) })
    hooks.suggest(word.word).then((suggestions) => {
      const cur = view.state.field(menu)
      if (cur && cur.word.from === word.from) view.dispatch({ effects: openMenu.of({ word, suggestions }) })
    })
    return true
  }

  return [
    plugin,
    menu,
    keymap.of([
      { key: 'Mod-.', preventDefault: true, run: (v) => openAt(v, v.state.selection.main.head) },
      { key: 'Escape', run: (v) => (v.state.field(menu) ? (v.dispatch({ effects: closeMenu.of(null) }), true) : false) },
    ]),
    EditorView.domEventHandlers({
      contextmenu(e, view) {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos === null || !openAt(view, pos)) return false
        e.preventDefault()
        return true
      },
    }),
    EditorView.baseTheme({
      '.cm-misspelled': { textDecoration: 'underline wavy #cf222e', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
      '.cm-tooltip.cm-spell-menu, .cm-spell-menu': { display: 'flex', flexDirection: 'column', padding: '4px', minWidth: '180px', fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: '13px' },
      '.cm-spell-menu button': { border: 'none', background: 'none', textAlign: 'left', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', font: 'inherit' },
      '.cm-spell-menu button:hover': { background: 'var(--accent-soft, #e3ecfb)' },
      '.cm-spell-menu .cm-spell-suggestion': { fontWeight: '600' },
      '.cm-spell-menu hr': { border: 'none', borderTop: '1px solid var(--border, #d9dce1)', margin: '4px 0', width: '100%' },
      '.cm-spell-note': { color: '#6a737d', padding: '4px 10px' },
    }),
  ]
}
