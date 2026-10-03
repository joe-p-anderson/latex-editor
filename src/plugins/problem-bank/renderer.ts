import { Decoration, WidgetType } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import type { PluginRenderer } from '../../renderer/src/lib/plugins.svelte'
import { dirOf, includeCandidates } from '../../shared/project'
import { scanIncludes, type BankIndex, type Fragment } from './bank'
import { addQuestionToBank, newAssignment } from './ui/actions'
import ProblemsView from './ui/ProblemsView.svelte'
import { bank, resetStore, setIndex } from './ui/store.svelte'

// In the live view, an \input of a bank problem shows a small card after it.
class ProblemCard extends WidgetType {
  constructor(
    readonly title: string,
    readonly tags: string[],
    readonly difficulty: number | null,
  ) {
    super()
  }
  eq(o: ProblemCard) {
    return o.title === this.title && o.difficulty === this.difficulty && o.tags.join() === this.tags.join()
  }
  toDOM() {
    const el = document.createElement('span')
    el.style.cssText =
      'margin-left:10px;padding:1px 8px;border:1px solid var(--line);border-radius:10px;background:var(--side);color:var(--ink-soft);font:12px var(--f-ui);white-space:nowrap'
    const title = document.createElement('strong')
    title.textContent = this.title
    title.style.cssText = 'color:var(--ink);font-weight:600'
    el.append(title)
    const rest = [this.difficulty ? '●'.repeat(this.difficulty) : '', ...this.tags].filter(Boolean).join(' · ')
    if (rest) el.append(` · ${rest}`)
    return el
  }
  ignoreEvent() {
    return true
  }
}

const problemBank: PluginRenderer = (ctx) => {
  ctx.onDispose(resetStore)

  // In the live view, an \input of a bank problem gets a card.
  const cards = ctx.live.decorations((state, file) => {
    if (!bank.fragments.length) return []
    const byId = new Map<string, Fragment>(bank.fragments.filter((f) => !f.library).map((f) => [f.id.toLowerCase(), f]))
    const out: Range<Decoration>[] = []
    const dir = dirOf(file ?? '')
    for (const inc of scanIncludes(state.doc.toString())) {
      const f = includeCandidates(inc, dir, dir).candidates.map((c) => byId.get(c.toLowerCase())).find(Boolean)
      if (f) out.push(Decoration.widget({ widget: new ProblemCard(f.title, f.tags, f.difficulty), side: 1 }).range(state.doc.lineAt(inc.to).to))
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
