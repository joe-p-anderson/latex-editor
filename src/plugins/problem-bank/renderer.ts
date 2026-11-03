import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import type { PluginRenderer } from '../../renderer/src/lib/plugins.svelte'
import { dirOf, includeCandidates } from '../../shared/project'
import { previewBlocks, scanIncludes, type BankIndex, type Fragment } from './bank'
import { addQuestionToBank, moveToProblem, newAssignment } from './ui/actions'
import { mathDrawer } from './ui/draw'
import ProblemsView from './ui/ProblemsView.svelte'
import { bank, resetStore, setIndex } from './ui/store.svelte'

// In the live view, an \input of a bank problem is drawn as a card with the
// whole problem in it, as the core draws a paper's \input as a card of its
// headings. Clicking opens the problem; Alt+click (or moving the cursor onto
// the line) shows the source.
class ProblemCard extends WidgetType {
  constructor(
    readonly f: Fragment,
    readonly draw: (tex: string, display: boolean) => string,
    readonly open: (rel: string) => void,
  ) {
    super()
  }
  eq(o: ProblemCard) {
    const a = this.f
    const b = o.f
    return a.id === b.id && a.body === b.body && a.title === b.title && a.difficulty === b.difficulty && a.tags.join() === b.tags.join()
  }
  toDOM(view: EditorView) {
    const { f } = this
    const el = (tag: string, cls: string, text?: string) => {
      const e = document.createElement(tag)
      e.className = cls
      if (text !== undefined) e.textContent = text
      return e
    }
    const card = el('div', 'cm-live-include cm-live-problem')
    const head = el('div', 'cm-live-include-head')
    head.append(el('span', 'cm-live-include-icon', '❧'), el('span', 'cm-live-problem-title', f.title))
    if (f.difficulty) head.append(el('span', 'cm-live-problem-dots', '●'.repeat(f.difficulty)))
    if (f.tags.length) head.append(el('span', 'cm-live-problem-tags', f.tags.join(' · ')))
    card.append(head)
    const body = el('div', 'cm-live-problem-body')
    for (const block of previewBlocks(f.body)) {
      const p = el('p', block.label ? 'part' : '')
      if (block.label) p.append(el('span', 'cm-live-problem-label', block.label))
      for (const s of block.segs) {
        if (s.t === 'text') p.append(s.s)
        else if (s.t === 'figure') p.append(el('span', 'cm-live-problem-figure', s.label))
        else {
          const m = el('span', `cm-live-problem-math${s.display ? ' display' : ''}`)
          m.innerHTML = this.draw(s.tex, s.display)
          p.append(m)
        }
      }
      body.append(p)
    }
    card.append(body)
    card.title = `${f.id}\nClick to open; Alt+click to edit the line`
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (!e.altKey) {
        this.open(f.id)
        return
      }
      view.dispatch({ selection: { anchor: view.posAtDOM(card) } })
      view.focus()
    })
    const box = el('div', 'cm-live-box')
    box.append(card)
    return box
  }
}

const cardTheme = EditorView.baseTheme({
  '.cm-live-problem-title': { fontWeight: '600', color: 'var(--ink)' },
  '.cm-live-problem-dots': { color: 'var(--detail)', letterSpacing: '1px' },
  '.cm-live-problem-tags': { marginLeft: 'auto' },
  '.cm-live-problem-body': { fontFamily: 'var(--f-page)', fontSize: 'calc(var(--page-size) * 0.9)', lineHeight: '1.5', color: 'var(--ink)', marginTop: '4px' },
  '.cm-live-problem-body p': { margin: '0 0 4px' },
  '.cm-live-problem-body p.part': { paddingLeft: '1.8em', textIndent: '-1.8em' },
  '.cm-live-problem-label': { display: 'inline-block', width: '1.8em', textIndent: '0', color: 'var(--ink-soft)' },
  '.cm-live-problem-math svg': { verticalAlign: 'middle', maxWidth: '100%' },
  '.cm-live-problem-math.display': { display: 'block', textAlign: 'center', overflowX: 'auto', textIndent: '0' },
  '.cm-live-problem-math .bad': { color: 'var(--err)' },
  '.cm-live-problem-figure': {
    padding: '0 6px',
    border: '1px dashed var(--line)',
    borderRadius: '3px',
    fontFamily: 'var(--f-ui)',
    fontSize: '0.75em',
    color: 'var(--ink-soft)',
  },
})

const problemBank: PluginRenderer = (ctx) => {
  ctx.onDispose(resetStore)

  // In the live view, an \input of a bank problem on a line of its own is
  // drawn as a card, except in a paper, whose \input lines are the core's.
  const draw = mathDrawer(() => ctx.editor.math())
  const open = (rel: string) => void ctx.host.open(rel, 1)
  ctx.editor.extension(cardTheme)
  const cards = ctx.live.decorations((state, file, inPaper) => {
    if (inPaper || !bank.fragments.length) return []
    const byId = new Map<string, Fragment>(bank.fragments.filter((f) => !f.library).map((f) => [f.id.toLowerCase(), f]))
    const out: Range<Decoration>[] = []
    const dir = dirOf(file ?? '')
    const { doc, selection } = state
    for (const inc of scanIncludes(doc.toString())) {
      const f = includeCandidates(inc, dir, dir).candidates.map((c) => byId.get(c.toLowerCase())).find(Boolean)
      if (!f) continue
      const a = doc.lineAt(inc.from)
      const b = doc.lineAt(inc.to)
      if (doc.sliceString(a.from, inc.from).trim() || doc.sliceString(inc.to, b.to).trim()) continue
      if (selection.ranges.some((r) => r.from <= b.to && r.to >= a.from)) continue
      out.push(Decoration.replace({ widget: new ProblemCard(f, draw, open), block: true }).range(a.from, b.to))
    }
    return out
  })

  const load = async () => {
    setIndex(await ctx.invoke<BankIndex>('index'))
    // An \input may have just become (or stopped being) a bank problem.
    cards.refresh()
  }
  ctx.on('index', () => void load())
  ctx.on('checked', (d) => {
    const { id, result } = d as { id: string; result: BankIndex['checks'][string] }
    bank.checks = { ...bank.checks, [id]: result }
  })
  void load().catch((e) => console.error('Problem bank:', e))

  ctx.views.add({ id: 'problems', tip: 'Problems', component: ProblemsView })

  ctx.commands.add({ id: 'add-question', title: 'Add question to bank', run: () => addQuestionToBank(ctx) })
  ctx.editor.contextMenu({ label: 'Move to problem…', enabled: (sel) => !!sel.text.trim(), run: () => moveToProblem(ctx) })
  ctx.commands.add({ id: 'new-assignment', title: 'New assignment from problems', run: () => newAssignment(ctx) })
  ctx.commands.add({
    id: 'check-all',
    title: 'Check all problems',
    run: async () => {
      ctx.host.notify('Checking the bank…')
      const r = await ctx.invoke<{ total: number; bad: number }>('checkAll')
      ctx.host.notify(r.total ? (r.bad ? `${r.bad} of ${r.total} problems have errors` : `All ${r.total} problems build`) : 'The bank has no problems yet')
    },
  })
}

export default problemBank
