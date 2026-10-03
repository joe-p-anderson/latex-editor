// What the plugin does to the open document: insert a problem, add a
// question to the bank, start an assignment. Shared by the view's buttons
// and the commands.
import type { RendererContext } from '../../../renderer/src/lib/plugins.svelte'
import {
  addToPreamble,
  dedentBlock,
  detectNeeds,
  findQuestionBlock,
  guessTitle,
  insertText,
  missingDefinitions,
  readDefinitions,
  specName,
  type Fragment,
} from '../bank'
import { bank } from './store.svelte'

/** Puts a problem in the open document at the cursor, then adds the packages and definitions it needs. */
export async function insertProblem(ctx: RendererContext, f: Fragment): Promise<void> {
  const { editor, packages } = ctx.host
  if (!editor.file()) return ctx.host.notify('Open a document to insert a problem')
  const mode = ctx.settings.vault().insertMode === 'copy' ? 'copy' : 'input'
  editor.insertBlock(insertText(f, mode))
  editor.focus()
  const added: string[] = []
  const missing = f.needs.length ? await packages.missing(f.needs) : []
  if (missing?.length) {
    await packages.ensure(missing)
    added.push(...missing.map(specName))
  }
  // Definitions go in the root document's preamble, unless it has them already.
  const root = f.preamble.length ? await ctx.host.root() : null
  if (root) {
    const text = await editor.textOf(root)
    const lines = missingDefinitions(text, f.preamble)
    const change = addToPreamble(text, lines)
    if (change) {
      await editor.applyTo(root, [change])
      added.push(...lines.flatMap((l) => readDefinitions(l).map((d) => d.name)))
    } else if (lines.length) ctx.host.notify(`${f.title}: no \\begin{document} to put its definitions before`)
  }
  ctx.host.notify(added.length ? `Inserted ${f.title}. Added ${added.join(', ')}.` : `Inserted ${f.title}`)
}

/** Takes the \question around the cursor into the bank and leaves an \input in its place. */
export async function addQuestionToBank(ctx: RendererContext): Promise<void> {
  const { editor } = ctx.host
  const file = editor.file()
  if (!file) return ctx.host.notify('Open a document first')
  const text = editor.text()
  const block = findQuestionBlock(text, editor.cursor())
  if (!block) return ctx.host.notify('Put the cursor inside a \\question first')
  const source = text.slice(block.from, block.to)
  const title = (await ctx.host.prompt({ title: 'Problem title', initial: guessTitle(source) }))?.trim()
  if (!title) return
  const tagText = await ctx.host.prompt({ title: 'Tags (comma separated)', hint: 'for example: kinematics, projectile motion' })
  if (tagText === null) return
  // The document may have changed while the prompts were open.
  const now = editor.text()
  const again = findQuestionBlock(now, editor.cursor())
  if (!again || now.slice(again.from, again.to) !== source) return ctx.host.notify('The question changed while you were naming it. Try again.')
  // The preamble the question was written against: the root document's.
  const root = (await ctx.host.root()) ?? file
  const rootText = root === file ? now : await editor.textOf(root)
  const begin = /\\begin\s*\{document\}/.exec(rootText)
  const { needs, preamble } = detectNeeds(source, begin ? rootText.slice(0, begin.index) : '')
  const tags = tagText.split(',').map((t) => t.trim()).filter(Boolean)
  const body = dedentBlock(now, again) + '\n'
  const { rel, arg } = await ctx.invoke<{ rel: string; arg: string }>('save', { title, tags, needs, preamble }, body)
  editor.replace(again.from, again.to, `\\input{${arg}}`)
  ctx.host.notify(`Added "${title}" to the bank as ${rel}`)
}

/** Asks for a file name and writes a new assignment from the marked problems, then opens it. */
export async function newAssignment(ctx: RendererContext): Promise<void> {
  if (!bank.marked.length) return ctx.host.notify('Mark problems in the Problems view first')
  const name = await ctx.host.prompt({ title: 'New assignment file name', initial: 'Homework/HW', hint: 'a vault-relative path; .tex is added' })
  if (!name?.trim()) return
  const r = await ctx.invoke<{ rel?: string; error?: string }>('assignment', name, [...bank.marked])
  if (!r.rel) return ctx.host.notify(r.error ?? 'Could not write the assignment')
  const n = bank.marked.length
  bank.marked = []
  ctx.host.notify(`Wrote ${r.rel} with ${n} problem${n === 1 ? '' : 's'}`)
  await ctx.host.open(r.rel)
}
