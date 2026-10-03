<script lang="ts">
  import { onMount } from 'svelte'
  import type { BibInfo, CompileResult, EditorContext, PaperInfo, Problem, QuickFix, SectionTarget, TextEdit, TreeNode, VaultInfo } from '@shared/api'
  import { isDocument, magicRoot, parseIncludes, rootComment, type Include } from '@shared/project'
  import { extractSection, includeBlock, inlineInclude, moveInclude, placeNewFile, renameIncludes, renumberPlan, slugify, toggleInclude } from '@shared/paperedit'
  import PaperMap, { type PaperMapActions } from './lib/PaperMap.svelte'
  import { PaperModel } from '@shared/papermodel'
  import { outline as outlineOf } from '@shared/latexedit'
  import type { LivePaper } from './lib/live/live'
  import CitePicker from './lib/CitePicker.svelte'
  import { makeCitations, type Citations } from './lib/citations'
  import { OPEN_CITE } from '@shared/bibtex'
  import FileTree from './lib/FileTree.svelte'
  import Editor from './lib/Editor.svelte'
  import PdfViewer from './lib/PdfViewer.svelte'
  import ProblemsPanel from './lib/ProblemsPanel.svelte'
  import ImagePicker from './lib/ImagePicker.svelte'
  import Outline from './lib/Outline.svelte'
  import TabBar from './lib/TabBar.svelte'
  import QuickOpen from './lib/QuickOpen.svelte'
  import type { EditingHooks } from './lib/editing'
  import { blankComments, mergeTextSnippets, parseSnippets, type OutlineItem, type Snippet } from '@shared/latexedit'
  import { includegraphics, type ImageHooks } from './lib/imageSupport'
  import { clearThumbnails } from './lib/thumbnails'
  import { isImage } from '@shared/images'
  import { renameKeyChanges, replacementChanges, searchText, type SearchMatch, type SearchOptions } from '@shared/search'
  import SearchPanel from './lib/SearchPanel.svelte'
  import PromptDialog from './lib/PromptDialog.svelte'
  import TableEditor from './lib/TableEditor.svelte'
  import { insertRow, newTable, packagesFor, parseTable, pasteGrid, serializeTable, type TableModel } from '@shared/tablemodel'
  import { normalizeEol } from '@shared/search'
  import { clearSpellingCache, type SpellHooks } from './lib/spellcheck'
  import SymbolPanel, { type LibrarySymbol, type SymbolActions } from './lib/SymbolPanel.svelte'
  import { findMathRegions, mathAtCursor } from '@shared/mathregions'
  import { BUILTIN_MATH_SNIPPETS, mathSnippetsFileTemplate, mergeSnippets, parseMathSnippets, type MathSnippet } from '@shared/mathsnippets'
  import AppearancePanel from './lib/AppearancePanel.svelte'
  import { applyAppearance, logoUrl, smallLogo } from './lib/appearance'
  import { marbleCss } from './lib/marbles.svelte'
  import TitleBar, { type BuildState } from './lib/TitleBar.svelte'
  import ActivityBar, { type View, type ViewButton } from './lib/ActivityBar.svelte'
  import StatusBar from './lib/StatusBar.svelte'
  import CitationsView from './lib/CitationsView.svelte'
  import Icon from './lib/Icon.svelte'
  import Welcome from './lib/Welcome.svelte'
  import EmptyPlate from './lib/EmptyPlate.svelte'
  import IndexTabs from './lib/IndexTabs.svelte'
  import { tick } from 'svelte'
  import {
    DEFAULT_APP_APPEARANCE,
    defaultVaultAppearance,
    normalizeAppAppearance,
    normalizeVaultAppearance,
    type AppAppearance,
    type VaultAppearance,
  } from '@shared/appearance'

  const TEXT_FILE = /\.(tex|cls|sty|bib|cfg|txt|md|json)$/i

  let vault = $state<VaultInfo | null>(null)
  // Whether the vault reopened at launch (if any) has loaded.
  let started = $state(false)
  let active = $state<string | null>(null)
  // Open files in tab order, and most recently used first (for Ctrl+Tab).
  let tabs = $state<string[]>([])
  let mru: string[] = []
  let quickOpen = $state(false)
  let dirty = $state(new Set<string>())
  let editor = $state<Editor>()
  let viewer = $state<PdfViewer>()

  // A short-lived message in the header (e.g. why a jump went nowhere).
  let note = $state<string | null>(null)
  let noteTimer: ReturnType<typeof setTimeout> | undefined
  function flash(msg: string): void {
    note = msg
    clearTimeout(noteTimer)
    noteTimer = setTimeout(() => (note = null), 3500)
  }

  let compiling = $state(false)
  let previewing = $state(false)
  let result = $state<CompileResult | null>(null)
  let pdf = $state<string | null>(null)
  let pdfVersion = $state(0)
  let compileSeq = 0

  // --- Workbench layout ---------------------------------------------------------
  // Pane sizes and what's open are remembered per install (localStorage).

  const LAYOUT_KEY = 'endleaf-layout'
  const savedLayout = (() => {
    try {
      return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}')
    } catch {
      return {}
    }
  })()
  /** Editor share of the editor+PDF area, adjusted by dragging the splitter. */
  let split = $state<number>(savedLayout.split ?? 0.6)
  let pdfOpen = $state<boolean>(savedLayout.pdfOpen ?? false)
  // With no file open the plate fills the pane; the PDF comes back with a file.
  const showPdf = $derived(pdfOpen && !!active)
  let sideOpen = $state<boolean>(savedLayout.sideOpen ?? true)
  let sideWidth = $state<number>(savedLayout.sideWidth ?? 272)
  let panelOpen = $state(false)
  let panelHeight = $state<number>(savedLayout.panelHeight ?? 190)
  let panelTab = $state<'problems' | 'log'>('problems')
  // Sidebar sections (Files, Contents) folded open or closed.
  let filesSection = $state(true)
  $effect(() => {
    const layout = { split, pdfOpen, sideOpen, sideWidth, panelHeight }
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // not remembered; fine
    }
  })
  let editors = $state<HTMLDivElement>()
  let work = $state<HTMLDivElement>()
  let mainArea = $state<HTMLDivElement>()

  $effect(() => {
    document.title = vault ? `${vault.name} · endleaf` : 'endleaf'
  })

  // The sidebar's view. Clicking the lit view's icon (or Ctrl+Shift+B) folds the sidebar away.
  let view = $state<View>('files')
  function showView(v: View): void {
    if (sideOpen && view === v) sideOpen = false
    else {
      view = v
      sideOpen = true
    }
  }

  const VIEWS: ViewButton[] = [
    { id: 'files', icon: 'files', tip: 'Files' },
    { id: 'contents', icon: 'contents', tip: "Contents: the file's sections, or the whole paper's" },
    { id: 'search', icon: 'search', tip: 'Search the vault (Ctrl+Shift+H)' },
    { id: 'symbols', icon: 'symbols', tip: 'Symbols' },
  ]

  // Contextual tools: Citations when the vault has a .bib file.
  const hasBib = $derived(!!vault && allFiles(vault.tree).some((f) => f.toLowerCase().endsWith('.bib')))
  // The paper the open file belongs to: its root and the files it pulls in.
  let paper = $state<PaperInfo | null>(null)
  const tools = $derived<ViewButton[]>([
    ...(hasBib ? [{ id: 'cite', icon: 'cite', tip: 'Citations. Shown because this vault has a .bib file' } as ViewButton] : []),
  ])
  // A tool that's no longer offered falls back to Files.
  $effect(() => {
    if (view === 'cite' && !hasBib) view = 'files'
  })

  /** The paper `rel` belongs to (the main process works out its root). */
  async function loadPaper(rel: string): Promise<void> {
    if (!rel.endsWith('.tex') || !vault) return
    const info = await window.api.paperInfo(rel).catch(() => null)
    if (rel !== active) return
    paper = info
    rebuildPaperModel()
  }

  // A marked paper read through, as LaTeX would: each file's starting
  // numbers, headings and labels. Open files count with their unsaved text.
  let paperModel = $state.raw<PaperModel | null>(null)
  function rebuildPaperModel(): void {
    const p = paper
    if (!p?.declared) paperModel = null
    else {
      const text = (rel: string) => {
        const t = editor?.textOf(rel) ?? p.texts[rel]
        return t == null ? null : normalizeEol(t)
      }
      paperModel = new PaperModel(p.root, p.files, text, vault?.lists ?? {})
    }
    editor?.refreshPaper()
  }
  const inPaper = (rel: string | null) => !!rel && !!paperModel && !!paper?.files.some((f) => f.rel === rel)

  /** A file's place in the paper, for the live view. */
  function livePaper(rel: string | null): LivePaper | null {
    const model = paperModel
    if (!rel || !model || !inPaper(rel)) return null
    const i = readingOrder.indexOf(rel)
    const neighbour = (r: string | undefined) => {
      if (!r) return null
      const s = model.sectionsOf(r)
      return { rel: r, label: s ? `§${s}` : null }
    }
    return {
      options: model.options(rel),
      prev: i > 0 ? neighbour(readingOrder[i - 1]) : null,
      next: i >= 0 ? neighbour(readingOrder[i + 1]) : null,
      card: (inc, off) => {
        const child = model.childOf(rel, inc)
        const file = child ? paper?.files.find((f) => f.rel === child) : null
        const known = child ? model.files.get(child) : null
        const headings = known
          ? known.headings.map((h) => ({ level: h.level, number: h.number, title: h.title }))
          : child && paper?.texts[child] != null
            ? outlineOf(normalizeEol(paper.texts[child])).filter((o) => o.kind !== 'question').map((o) => ({ level: o.depth + 1, number: null, title: o.title }))
            : []
        return { rel: child ?? inc.arg, exists: !!file?.exists, off: off || !!file?.off, headings }
      },
    }
  }

  // The open paper's files, marked in the tabs. Kept while another file is
  // showing, so the paper's tabs stay marked.
  let paperTabs = $state(new Map<string, string>())
  $effect(() => {
    if (paper) paperTabs = paper.declared ? new Map(paper.files.map((f) => [f.rel, paper!.name])) : new Map()
  })

  // --- The paper map's edits ---------------------------------------------------

  const fileOf = (rel: string) => paper?.files.find((f) => f.rel === rel) ?? null
  const sameInclude = (a: Include, b: Include) => a.cmd === b.cmd && a.dir === b.dir && a.arg === b.arg
  /** `rel`'s include in its parent's current text (\n breaks), found afresh. */
  const includeIn = (text: string, rel: string) => {
    const want = fileOf(rel)?.include
    return want ? (parseIncludes(text).find((i) => sameInclude(i, want)) ?? null) : null
  }
  const currentText = async (rel: string) => normalizeEol((await textOf(rel).catch(() => '')) ?? '')
  const taken = (rel: string) => !!vault && allFiles(vault.tree).some((f) => f.toLowerCase() === rel.toLowerCase())

  /** After the paper's structure changed: read it again and build it. */
  async function afterPaperEdit(): Promise<void> {
    lastRenumber = null // another change: the last renumbering is no longer the one to undo
    if (active) await loadPaper(active)
    if (paper) await compile(paper.root)
  }

  // Asking for a section title or a file name, then doing something with it.
  let paperPrompt = $state<{ title: string; initial: string; hint: string; run: (value: string) => void } | null>(null)

  const paperActions: PaperMapActions = {
    open: (rel, line) => go(rel, line > 1 ? line : undefined),
    async toggle(rel) {
      const f = fileOf(rel)
      if (!f?.parent) return
      await editAndSave(f.parent, (t) => {
        const inc = includeIn(t, rel)
        return inc ? toggleInclude(t, inc) : []
      })
      flash(`${rel.split('/').pop()} switched ${f.off ? 'on' : 'off'}`)
      await afterPaperEdit()
    },
    async move(rel, target, place) {
      const f = fileOf(rel)
      if (!f?.parent || fileOf(target)?.parent !== f.parent) return
      await editAndSave(f.parent, (t) => {
        const a = includeIn(t, rel)
        const b = includeIn(t, target)
        return a && b ? moveInclude(t, a, b, place) : []
      })
      await afterPaperEdit()
    },
    newAfter(rel) {
      const p = paper
      if (!p) return
      paperPrompt = {
        title: 'New section file',
        initial: '',
        hint: `The section's title (its file is named from it), or a file name such as 5_Methods.tex. It goes beside the paper's other files, ${rel ? `after ${rel.split('/').pop()}` : 'at the end'}.`,
        run: (title) => newSectionFile(p.root, rel, title),
      }
    },
    extract(rel, line, title) {
      const p = paper
      if (!p) return
      paperPrompt = {
        title: `Move "${title}" to a file of its own`,
        initial: slugify(title),
        hint: `A file name (no .tex). ${rel.split('/').pop()} keeps an \input in its place.`,
        run: (name) => extractToFile(p.root, rel, line, name),
      }
    },
    async inline(rel) {
      const f = fileOf(rel)
      if (!f?.parent) return
      const child = await currentText(rel)
      await editAndSave(f.parent, (t) => {
        const inc = includeIn(t, rel)
        return inc ? inlineInclude(t, inc, child) : []
      })
      // Its text lives in the parent now; the file itself is asked about.
      trashOffer = { rel, into: f.parent }
      await afterPaperEdit()
    },
    unmark: () => markPaper(false),
  }

  // A file whose text was put back into its parent: send it to the Recycle Bin?
  let trashOffer = $state<{ rel: string; into: string } | null>(null)
  async function trashPutBack(): Promise<void> {
    const t = trashOffer
    trashOffer = null
    if (!t) return
    if (tabs.includes(t.rel)) forgetTab(t.rel)
    await window.api.trashFile(t.rel).then(
      () => flash(`Sent ${t.rel.split('/').pop()} to the Recycle Bin`),
      (e: Error) => flash(`Couldn't remove ${t.rel}: ${e.message}`),
    )
  }

  /** Creates a file for a new section, with its \input after `after`'s (or at the end of the root). */
  async function newSectionFile(root: string, after: string | null, title: string): Promise<void> {
    paperPrompt = null
    title = title.trim()
    if (!title || !paper) return
    const parent = after ? (fileOf(after)?.parent ?? root) : root
    const siblings = paper.files.filter((f) => f.parent === parent && f.include).map((f) => ({ rel: f.rel, arg: f.include!.arg }))
    // A file name (5_Methods.tex, more_appendices) is used as typed, and the
    // heading made from it; a title names the file.
    const asName = /\.tex$/i.test(title) || (/^[\w.-]+$/.test(title) && /[_-]/.test(title))
    const fileBase = asName ? title.replace(/\.tex$/i, '').replace(/[^\w.-]+/g, '_') : slugify(title)
    if (asName) title = title.replace(/\.tex$/i, '').replace(/^\d+[_-]/, '').replace(/[_-]+/g, ' ').trim() || title
    const { rel, arg } = placeNewFile(fileBase, root, siblings, taken)
    await window.api.writeFile(rel, `${rootComment(rel, root)}\n\\section{${title}}\n\n`)
    await editAndSave(parent, (t) => {
      const line = `\\input{${arg}}\n`
      const prev = after ? includeIn(t, after) : null
      if (prev) {
        const b = includeBlock(t, prev)
        return [{ from: b.to, to: b.to, insert: b.to === t.length && !t.endsWith('\n') ? `\n${line}` : line }]
      }
      // At the end of the root's includes, else before the bibliography or \end{document}.
      const last = parseIncludes(t).at(-1)
      if (last) {
        const b = includeBlock(t, last)
        return [{ from: b.to, to: b.to, insert: line }]
      }
      const end = t.search(/^[ \t]*\\(bibliography|printbibliography|end\s*\{document\})/m)
      const at = end < 0 ? t.length : end
      return [{ from: at, to: at, insert: line }]
    })
    await afterPaperEdit()
    await openFile(rel)
  }

  /** Moves the section on `line` of `rel` into a new file `name`.tex. */
  async function extractToFile(root: string, rel: string, line: number, name: string): Promise<void> {
    paperPrompt = null
    name = slugify(name.replace(/\.tex$/i, ''))
    if (!paper || !name) return
    const siblings = paper.files.filter((f) => f.parent === root && f.include).map((f) => ({ rel: f.rel, arg: f.include!.arg }))
    const place = placeNewFile(name, root, siblings, taken)
    const text = await currentText(rel)
    const out = extractSection(text, line, 'input', place.arg, `${rootComment(place.rel, root)}\n`)
    if (!out) return flash('No section heading on that line')
    await window.api.writeFile(place.rel, out.body)
    await editAndSave(rel, () => out.changes)
    flash(`Moved to ${place.rel}`)
    await afterPaperEdit()
  }

  // Number-prefixed file names out of order (after a reorder or a new file):
  // the renames that would fix them, unless they were waved off.
  let keptOrder = $state(new Set<string>())
  const renames = $derived.by(() => {
    const p = paper
    if (!p?.declared) return []
    const parents = [...new Set(p.files.map((f) => f.parent).filter((x): x is string => !!x))]
    const plan = parents.flatMap((parent) => renumberPlan(p.files.filter((f) => f.parent === parent && f.exists && f.rel.endsWith('.tex')).map((f) => f.rel)))
    return keptOrder.has(JSON.stringify(plan)) ? [] : plan
  })

  /** Renames files (from → to) and points the paper's includes at the new names. */
  async function applyRenames(plan: { from: string; to: string }[]): Promise<boolean> {
    const p = paper
    if (!p || !editor) return false
    const map = new Map(plan.map((r) => [r.from, r.to]))
    // Includes first, while the paper still knows which file each one means.
    const target = (parent: string) => (inc: Include) => p.files.find((f) => f.parent === parent && f.include && sameInclude(f.include, inc))?.rel ?? null
    for (const parent of new Set(plan.map((r) => fileOf(r.from)?.parent).filter((x): x is string => !!x))) {
      await editAndSave(parent, (t) => renameIncludes(t, parseIncludes(t), target(parent), map))
    }
    // Through temporary names, so 2→3 and 3→2 don't collide.
    const temp = plan.map((r) => ({ ...r, tmp: `${r.from}.renaming` }))
    try {
      for (const r of temp) await window.api.renameFile(r.from, r.tmp)
      for (const r of temp) await window.api.renameFile(r.tmp, r.to)
    } catch (e) {
      flash(`Couldn't rename: ${(e as Error).message}`)
      return false
    }
    for (const r of plan) {
      editor.rename(r.from, r.to)
      tabs = tabs.map((t) => (t === r.from ? r.to : t))
      mru = mru.map((t) => (t === r.from ? r.to : t))
      if (dirty.has(r.from)) {
        setDirty(r.from, false)
        setDirty(r.to, true)
      }
      if (active === r.from) active = r.to
    }
    return true
  }

  // The last renumbering, so it can be undone.
  let lastRenumber = $state<{ from: string; to: string }[] | null>(null)
  async function renumber(): Promise<void> {
    const plan = renames
    if (!plan.length || !(await applyRenames(plan))) return
    flash(`Renumbered ${plan.length} file${plan.length === 1 ? '' : 's'}`)
    await afterPaperEdit()
    lastRenumber = plan
  }
  async function undoRenumber(): Promise<void> {
    const plan = lastRenumber
    lastRenumber = null
    if (!plan) return
    if (active) await loadPaper(active) // the includes now name the new files
    if (await applyRenames(plan.map((r) => ({ from: r.to, to: r.from })))) {
      await afterPaperEdit()
      // Undoing says "leave them": don't offer the same renames straight away.
      keptOrder = new Set(keptOrder).add(JSON.stringify(renumberPlanNow()))
    }
  }
  /** The renumber plan as it stands (for waving it off after an undo). */
  const renumberPlanNow = () => {
    const p = paper
    if (!p) return []
    const parents = [...new Set(p.files.map((f) => f.parent).filter((x): x is string => !!x))]
    return parents.flatMap((parent) => renumberPlan(p.files.filter((f) => f.parent === parent && f.exists && f.rel.endsWith('.tex')).map((f) => f.rel)))
  }

  /** The paper's files in reading order that can be opened: not the root, not switched off. */
  const readingOrder = $derived(paper?.declared ? paper.files.filter((f) => f.rel !== paper!.root && f.exists && !f.off).map((f) => f.rel) : [])
  /** The file `step` places from the open one in the paper's reading order. */
  function neighbour(step: number): string | null {
    if (!active || !inPaper(active)) return null
    const i = readingOrder.indexOf(active)
    if (i < 0) return step > 0 ? (readingOrder[0] ?? null) : null
    return readingOrder[i + step] ?? null
  }

  /** Where the open file stands in its paper, for the title bar: main §III. */
  const place = $derived.by(() => {
    if (!paperModel || !active || !inPaper(active) || !paper) return null
    if (active === paper.root) return null
    const s = paperModel.sectionsOf(active)
    return s ? `${paper.name} §${s}` : paper.name
  })

  /**
   * The document the open file belongs to: its paper's root, or the file
   * itself when it's a document, or the last one built.
   */
  async function rootOfActive(): Promise<string | null> {
    if (!active) return null
    if (paper && (paper.root === active || paper.files.some((f) => f.rel === active))) return paper.root
    const own = normalizeEol((await textOf(active).catch(() => '')) ?? '')
    return isDocument(own) ? active : (result?.root ?? null)
  }

  /**
   * Edits `rel` (`changes` are offsets into its text with \n line breaks)
   * and saves it. An open file changes in its editor, as one undoable change;
   * one with unsaved changes is left unsaved.
   */
  async function editAndSave(rel: string, changes: (text: string) => { from: number; to: number; insert: string }[]): Promise<void> {
    const open = editor?.textOf(rel)
    if (open != null && editor) {
      const wasDirty = dirty.has(rel)
      await editor.applyChangesTo(rel, changes(normalizeEol(open)))
      if (!wasDirty) {
        const text = editor.textOf(rel)!
        await window.api.writeFile(rel, text)
        editor.markSaved(rel, text)
      }
      return
    }
    const disk = await window.api.readFile(rel)
    let text = normalizeEol(disk)
    for (const c of [...changes(text)].sort((x, y) => y.from - x.from)) text = text.slice(0, c.from) + c.insert + text.slice(c.to)
    await window.api.writeFile(rel, disk.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text)
  }

  /**
   * Marks the open file's paper as a multi-part paper, so each of its files
   * builds it; each file gets a % !TEX root line, so other editors agree.
   * Unmarking keeps those lines.
   */
  async function markPaper(on: boolean): Promise<void> {
    const p = paper
    if (!p) return
    await window.api.declarePaper(p.root, on).catch((e: Error) => flash(`Couldn't save .vault.json: ${e.message}`))
    let marked = 0
    if (on) {
      for (const f of p.files) {
        if (f.rel === p.root || !f.exists || !f.rel.toLowerCase().endsWith('.tex')) continue
        const text = editor?.textOf(f.rel) ?? p.texts[f.rel] ?? ''
        if (magicRoot(f.rel, text) || isDocument(text)) continue
        await editAndSave(f.rel, () => [{ from: 0, to: 0, insert: `${rootComment(f.rel, p.root)}\n` }])
        marked++
      }
    }
    if (active) await loadPaper(active)
    flash(on ? `${p.name} is a multi-part paper${marked ? `; added % !TEX root to ${marked} file${marked === 1 ? '' : 's'}` : ''}` : `${p.name} is no longer marked as a paper`)
  }

  /** Dragging the sidebar's edge; below 140 px it closes. */
  function dragSidebar(ev: PointerEvent): void {
    const target = ev.currentTarget as HTMLElement
    target.setPointerCapture(ev.pointerId)
    const left = work!.getBoundingClientRect().left + 52
    const move = (m: PointerEvent) => {
      const w = m.clientX - left
      if (w < 140) sideOpen = false
      else {
        sideOpen = true
        sideWidth = Math.min(600, w)
      }
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true })
  }

  /** Dragging the bottom panel's top edge. */
  function dragPanel(ev: PointerEvent): void {
    const target = ev.currentTarget as HTMLElement
    target.setPointerCapture(ev.pointerId)
    const box = mainArea!.getBoundingClientRect()
    const move = (m: PointerEvent) => (panelHeight = Math.min(box.height - 120, Math.max(80, box.bottom - m.clientY)))
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true })
  }

  // The cursor, and the heading it's under, for the status bar.
  let cursorCol = $state(1)
  const section = $derived.by(() => {
    // In a paper, with the number LaTeX gives it (and the section an earlier file began).
    const own = active && inPaper(active) ? paperModel?.files.get(active) : null
    if (own) {
      const h = own.headings.findLast((x) => x.line <= cursorLine)
      if (h) return `§ ${h.ref ? `${h.ref} ` : ''}${h.title}`
    }
    const at = outlineItems.findLast((it) => it.line <= cursorLine && it.kind !== 'question')
    return at ? `§ ${at.title}` : own && active ? (paperModel?.sectionsOf(active) ? `§ ${paperModel.sectionsOf(active)}` : null) : null
  })

  let branch = $state<string | null>(null)
  const refreshBranch = () => window.api.gitBranch().then((b) => (branch = b))

  // The build, as the title bar's note and ribbon show it.
  const build = $derived.by<BuildState>(() => {
    if (compiling) return { kind: 'busy', note: 'Setting type…' }
    if (previewing) return { kind: 'busy', note: 'Previewing…', detail: 'Building your unsaved text. Ctrl+S saves and updates pdf/' }
    if (!result) return { kind: 'none', note: '' }
    const errors = result.problems.filter((p) => p.severity === 'error' && !p.hidden && !p.followOn).length
    const how = result.section
      ? `Just ${result.section} of ${result.root}, numbered as in the whole paper, with its labels and citations from the last full build. The whole paper builds when another of its files changes, or with Build → Recompile`
      : `${result.root}: ${result.passes} pass${result.passes === 1 ? '' : 'es'}${result.preloaded ? ', preamble preloaded' : ''}${result.fullReason ? `. Built in full: ${result.fullReason}` : ''}`
    const what = result.section ? result.section : result.draft ? 'Preview' : 'Built'
    if (errors) return { kind: 'err', note: `${errors} error${errors === 1 ? '' : 's'}${result.section ? ` in ${result.section}` : result.draft ? ' in preview' : ' · pdf/ unchanged'}`, detail: how }
    return { kind: 'ok', note: `${what} · ${(result.durationMs / 1000).toFixed(1)} s`, detail: how }
  })
  const problemCounts = $derived({
    errors: result?.problems.filter((p) => p.severity === 'error' && !p.hidden && !p.followOn).length ?? 0,
    warnings: result?.problems.filter((p) => p.severity === 'warning' && !p.hidden).length ?? 0,
  })

  function togglePdf(): void {
    pdfOpen = !pdfOpen
  }
  function togglePanel(tab?: 'problems' | 'log'): void {
    if (tab && panelOpen && panelTab !== tab) panelTab = tab
    else panelOpen = !panelOpen
    if (tab) panelTab = tab
  }

  // --- Appearance -------------------------------------------------------------

  // Global choices from settings.json; the endpaper comes with the vault.
  let appearance = $state<AppAppearance>(DEFAULT_APP_APPEARANCE)
  const endpaper = $derived(vault?.appearance ?? defaultVaultAppearance(''))
  // The palette's small logo and the endpaper, for the title bar, activity bar and status bar.
  const logo = $derived(smallLogo(endpaper.palette))
  const swatch = $derived(marbleCss(endpaper, 'small'))
  $effect(() => {
    if (!started) return // the endpaper isn't known yet; don't marble a sheet for nothing
    const tokens = applyAppearance(appearance, endpaper)
    window.api.setWindowChrome(tokens.chrome, tokens['chrome-ink-soft'])
    // The page's geometry may have moved under the editor; its selection and clicks follow it after layout.
    requestAnimationFrame(() => editor?.remeasure())
  })

  // Dragging the line-length slider changes it many times a second; it's saved once it settles.
  let appearanceTimer: ReturnType<typeof setTimeout> | undefined
  function setAppearance(changes: Partial<AppAppearance>): void {
    appearance = normalizeAppAppearance({ ...appearance, ...changes })
    clearTimeout(appearanceTimer)
    const saved = $state.snapshot(appearance)
    appearanceTimer = setTimeout(() => window.api.setAppearance(saved), 250)
  }

  async function setEndpaper(changes: Partial<VaultAppearance>): Promise<void> {
    if (!vault) return
    vault.appearance = normalizeVaultAppearance({ ...vault.appearance, ...changes }, vault.name)
    await window.api.setVaultAppearance(changes).catch((e: Error) => flash(`Couldn't save .vault.json: ${e.message}`))
  }

  function restoreDefaults(): void {
    setAppearance(DEFAULT_APP_APPEARANCE)
    if (vault) setEndpaper(defaultVaultAppearance(vault.name))
  }

  // The vault's images, for the picker, autocomplete and hover previews.
  let images = $state<string[]>([])
  // The picker: 'insert' puts the chosen image at the cursor; 'view' just shows images.
  let picker = $state<{ mode: 'insert' | 'view'; initial: string } | null>(null)

  async function loadImages(): Promise<void> {
    clearThumbnails() // files may have been replaced on disk
    images = vault ? await window.api.listImages() : []
  }

  const imageHooks: ImageHooks = {
    images: () => images,
    openPicker: () => (picker = { mode: 'insert', initial: '' }),
    importFiles: async (files) => {
      const rels: string[] = []
      for (const f of files) {
        const path = window.api.pathForFile(f)
        rels.push(path ? await window.api.importImage(path) : await window.api.saveImage(f.name, new Uint8Array(await f.arrayBuffer())))
      }
      await loadImages()
      return rels
    },
    savePasted: async (blob) => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const rel = await window.api.saveImage(`pasted-${stamp}.${ext}`, new Uint8Array(await blob.arrayBuffer()))
      await loadImages()
      flash(`Saved ${rel}`)
      return rel
    },
  }

  // For the editor's list continuation and completion.
  let context: EditorContext = { commands: [], environments: [] }
  let snippets: Snippet[] = []
  let mathSnippets: MathSnippet[] = BUILTIN_MATH_SNIPPETS
  const editingHooks: EditingHooks = {
    lists: () => vault?.lists ?? {},
    commands: () => context.commands,
    environments: () => context.environments,
    snippets: () => snippets,
    mathSnippets: () => mathSnippets,
    renameLabel: (key) => (renaming = key),
    editTable: (range, grid) => editTable(range, grid),
    citations: () => citations,
    openCitePicker: () => openCitePicker(),
    paperLabels: () => {
      const model = paperModel
      if (!model || !inPaper(active)) return []
      return [...model.labels].filter(([, t]) => t.file && t.file !== active).map(([key, t]) => ({ key, number: t.number, kind: t.kind, file: t.file! }))
    },
  }

  // The open document's bibliography: `bib` for the picker, `citations`
  // (with a key index) for completion, hover cards and the live view.
  let bib = $state<BibInfo | null>(null)
  let citations: Citations | null = null
  let citePicker = $state(false)

  async function loadBib(rel: string): Promise<void> {
    const info = await window.api.bibInfo(rel).catch(() => null)
    if (rel !== active) return
    bib = info
    citations = info ? makeCitations(info) : null
    editor?.refreshCitations()
  }

  function openCitePicker(): void {
    if (!active?.endsWith('.tex')) return flash('Open a .tex file to cite')
    if (!bib) return flash('The bibliography is still loading')
    citePicker = true
  }

  /**
   * Cites `keys` at the cursor: into the \cite{…} the cursor is in (with
   * commas as needed), or as a new \cite{…}.
   */
  function insertCitation(keys: string[]): void {
    citePicker = false
    if (!editor) return
    const text = editor.docText()
    const pos = editor.cursorPos()
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1
    const nl = text.indexOf('\n', pos)
    const lineEnd = nl < 0 ? text.length : nl
    const inCite = OPEN_CITE.test(text.slice(lineStart, pos)) && /^[^{]*\}/.test(text.slice(pos, lineEnd))
    if (inCite) {
      const before = text[pos - 1]
      const after = text[pos]
      const lead = before === '{' || before === ',' || before === ' ' ? '' : ','
      const trail = after === '}' || after === ',' ? '' : ','
      editor.insertAtCursor(lead + keys.join(',') + trail)
    } else {
      editor.insertAtCursor(`\\cite{${keys.join(',')}}`)
    }
    editor.focus()
  }

  /** Reads the vault's snippet and math shortcut files (none is fine). */
  async function loadSnippets(): Promise<void> {
    const g = await window.api.globalSnippets()
    snippets = vault ? mergeTextSnippets(parseSnippets(g.snippets ?? ''), parseSnippets((await window.api.readOptional(vault.snippets)) ?? '')) : []
    const own = parseMathSnippets(vault ? ((await window.api.readOptional(vault.mathSnippets)) ?? '') : '')
    mathSnippets = mergeSnippets(mergeSnippets(BUILTIN_MATH_SNIPPETS, parseMathSnippets(g.mathSnippets ?? '')), own)
    if (own.errors.length) flash(`${vault?.mathSnippets} line ${own.errors[0].line}: ${own.errors[0].message}`)
  }

  /** After saving `rel`: reload it if it's one of the vault's own settings files. */
  async function reloadIfSettings(rel: string): Promise<void> {
    if (rel === vault?.snippets || rel === vault?.mathSnippets) await loadSnippets()
    if (rel === vault?.words) {
      await window.api.reloadWords()
      clearSpellingCache()
      editor?.refreshSpellcheck()
    }
  }

  /** Edit → Math Shortcuts: opens the vault's file, creating it (with the built-ins listed) if needed. */
  async function editMathShortcuts(): Promise<void> {
    if (!vault) return
    const exists = (await window.api.readOptional(vault.mathSnippets)) !== null
    if (!exists) await window.api.writeFile(vault.mathSnippets, mathSnippetsFileTemplate())
    await openFile(vault.mathSnippets)
  }

  // The open file's outline, and where the cursor is in it.
  let outlineItems = $state<OutlineItem[]>([])
  let cursorLine = $state(1)
  // Whether the open file is in live mode (rendered) or plain source.
  let live = $state(true)

  // Spelling: on unless switched off (View → Check Spelling), remembered here.
  const SPELL_KEY = 'spellcheck'
  let spellOn = $state((() => {
    try {
      return localStorage.getItem(SPELL_KEY) !== 'false'
    } catch {
      return true
    }
  })())
  const spellHooks: SpellHooks = {
    enabled: () => spellOn,
    check: (words) => window.api.spellCheck(words),
    suggest: (word) => window.api.spellSuggest(word),
    add: async (word) => {
      await window.api.addWord(word)
      flash(`Added "${word}" to ${vault?.words}`)
    },
  }
  function setSpelling(on: boolean): void {
    spellOn = on
    try {
      localStorage.setItem(SPELL_KEY, String(on))
    } catch {
      // not remembered; fine
    }
    window.api.setSpellcheckMenu(on)
    editor?.refreshSpellcheck()
  }

  function pickImage(rel: string): void {
    picker = null
    editor?.insertAtCursor(includegraphics(rel))
  }

  onMount(() => {
    window.api.getAppearance().then((a) => (appearance = a))
    window.api.getVault().then((v) => {
      vault = v
      started = true
      loadImages()
      loadSnippets()
      refreshBranch()
    })
    const offTree = window.api.onTreeChanged((tree) => {
      if (vault) vault.tree = tree
      loadImages()
      // A file deleted or renamed outside the app loses its tab, unless it has unsaved changes.
      const present = new Set(allFiles(tree))
      for (const rel of tabs) if (!present.has(rel) && !dirty.has(rel)) forgetTab(rel)
    })
    const offClose = window.api.onCloseRequested(async () => {
      if (await settleUnsaved('closing')) window.api.closeWindow()
    })
    const offMenu = window.api.onMenuOpenVault(openVault)
    const offVault = window.api.onVaultChanged((v) => (vault = v))
    const offAppMenu = window.api.onMenu((name, arg) => {
      if (name === 'math-shortcuts') editMathShortcuts()
      else if (name === 'spellcheck') setSpelling(arg === true)
      else if (vault) menuCommand(name)
    })
    window.api.setSpellcheckMenu(spellOn)
    return () => (offTree(), offMenu(), offVault(), offClose(), offAppMenu())
  })

  /** Menu items the renderer carries out (most also have a shortcut, handled in onkeydown). */
  function menuCommand(name: string): void {
    if (name === 'quick-open') quickOpen = true
    else if (name === 'save-all') saveAll()
    else if (name === 'find-in-vault') openSearch()
    else if (name === 'insert-image' && active?.endsWith('.tex')) picker = { mode: 'insert', initial: '' }
    else if (name === 'cite') openCitePicker()
    else if (name === 'toggle-live') editor?.toggleLiveMode()
    else if (name === 'toggle-pdf') togglePdf()
    else if (name === 'toggle-sidebar') sideOpen = !sideOpen
    else if (name === 'toggle-panel') togglePanel()
    else if (name === 'appearance') showView('appearance')
    else if (name === 'recompile' && active) compile(active)
    else if (name === 'sync-forward') syncForward()
    else if (name === 'close-vault') closeVault()
  }

  /** File → Open Vault and the welcome screen's "Open a folder…". */
  const openVault = () => switchVault(() => window.api.openVault())

  /**
   * Swaps in the vault `get` opens (after offering to save unsaved files);
   * `get` returning null (a cancelled dialog) changes nothing.
   */
  async function switchVault(get: () => Promise<VaultInfo | null>): Promise<void> {
    if (vault && !(await settleUnsaved('opening another vault'))) return
    const v = await get().catch((e: Error) => (flash(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), null))
    if (!v) return
    reset()
    vault = v
    loadImages()
    loadSnippets()
    refreshBranch()
  }

  /** Back to the welcome screen. */
  async function closeVault(): Promise<void> {
    if (!(await settleUnsaved('closing the vault'))) return
    reset()
    vault = null
    await window.api.closeVault()
  }

  /** Forgets the open vault's files, build and tabs. */
  function reset(): void {
    for (const rel of tabs) editor?.close(rel)
    active = null
    tabs = []
    mru = []
    dirty = new Set()
    result = null
    pdf = null
    outlineItems = []
    paper = null
    paperModel = null
    backStack = []
    forwardStack = []
    clearSpellingCache() // another vault, another word list
  }


  async function openFile(rel: string): Promise<void> {
    if (isImage(rel)) {
      // Images open in the picker's view mode, filtered to this one.
      picker = { mode: 'view', initial: rel }
      return
    }
    if (!TEXT_FILE.test(rel)) return
    const previous = active
    await editor?.open(rel)
    active = rel
    // A new tab goes just after the one that was showing.
    if (!tabs.includes(rel)) {
      const at = previous && tabs.includes(previous) ? tabs.indexOf(previous) + 1 : tabs.length
      tabs = [...tabs.slice(0, at), rel, ...tabs.slice(at)]
    }
    if (!cycling) mru = [rel, ...mru.filter((r) => r !== rel)]
    loadMacros(rel)
  }

  // --- Back and forward ---------------------------------------------------------
  // Jumps (Ctrl+click, the contents, problems, search, the PDF, opening a
  // file) remember where they left from. Going back switches to that file's
  // tab (reopening it if it was closed): a file is only ever open once.

  interface Place {
    rel: string
    line: number
  }
  let backStack = $state<Place[]>([])
  let forwardStack = $state<Place[]>([])
  const here = (): Place | null => (active && editor ? { rel: active, line: editor.cursorLine() } : null)
  const samePlace = (a: Place, b: Place) => a.rel === b.rel && a.line === b.line

  /** Opens `rel` (at `line`), remembering where this left from. */
  async function go(rel: string, line?: number): Promise<void> {
    const from = here()
    await openFile(rel)
    if (active !== rel) return // an image, or not a text file: nothing to remember
    if (line) editor?.gotoLine(line)
    const to = here()
    if (from && to && !samePlace(from, to)) {
      backStack = [...backStack.slice(-99), from]
      forwardStack = []
    }
  }

  async function goBack(): Promise<void> {
    await travel(backStack, (s) => (backStack = s), forwardStack, (s) => (forwardStack = s))
  }
  async function goForward(): Promise<void> {
    await travel(forwardStack, (s) => (forwardStack = s), backStack, (s) => (backStack = s))
  }
  /** One step back (or forward): to the last place on `from`, putting here on `to`. */
  async function travel(from: Place[], setFrom: (s: Place[]) => void, to: Place[], setTo: (s: Place[]) => void): Promise<void> {
    // A place in a file that's gone is skipped.
    const present = vault ? new Set(allFiles(vault.tree)) : new Set<string>()
    const stack = [...from]
    let place = stack.pop()
    while (place && !present.has(place.rel)) place = stack.pop()
    setFrom(stack)
    if (!place) return
    const cur = here()
    if (cur) setTo([...to, cur])
    await openFile(place.rel)
    editor?.gotoLine(place.line)
  }

  /** Every file in the tree, vault-relative. */
  function allFiles(nodes: TreeNode[]): string[] {
    return nodes.flatMap((n) => (n.kind === 'dir' ? allFiles(n.children ?? []) : [n.rel]))
  }

  // A .bib rebuilds the document too (the last one compiled).
  const COMPILES = /\.(tex|cls|sty|cfg|bib)$/i

  /** Writes every unsaved file, then compiles once. */
  async function saveAll(): Promise<void> {
    if (!editor) return
    const texts = editor.dirtyTexts()
    for (const [rel, text] of texts) {
      await window.api.writeFile(rel, text)
      editor.markSaved(rel, text)
      await reloadIfSettings(rel)
    }
    if (texts.size) flash(`Saved ${texts.size} file${texts.size === 1 ? '' : 's'}`)
    const target = active && COMPILES.test(active) ? active : [...texts.keys()].find((r) => COMPILES.test(r))
    if (target) await compile(target)
  }

  /**
   * Before closing or switching vaults: if files are unsaved, asks whether
   * to save them. Returns false if the user cancelled.
   */
  async function settleUnsaved(action: string): Promise<boolean> {
    const texts = editor?.dirtyTexts() ?? new Map<string, string>()
    if (!texts.size) return true
    const answer = await window.api.askAboutUnsaved([...texts.keys()], action)
    if (answer === 'cancel') return false
    if (answer === 'save') await saveAll()
    return true
  }

  /** Removes a tab without asking, showing a neighbour if it was the open file. */
  function forgetTab(rel: string): void {
    const i = tabs.indexOf(rel)
    tabs = tabs.filter((t) => t !== rel)
    mru = mru.filter((t) => t !== rel)
    setDirty(rel, false)
    editor?.close(rel)
    if (active === rel) {
      active = null
      outlineItems = []
      const next = mru[0] ?? tabs[Math.max(0, Math.min(i, tabs.length - 1))]
      if (next) openFile(next)
    }
  }

  /** Closes a tab, offering to save it first. */
  async function closeTab(rel: string): Promise<void> {
    if (dirty.has(rel)) {
      const answer = await window.api.askAboutUnsaved([rel], 'closing')
      if (answer === 'cancel') return
      const text = editor?.textOf(rel)
      if (answer === 'save' && text != null) {
        await window.api.writeFile(rel, text)
        await reloadIfSettings(rel)
      }
    }
    forgetTab(rel)
  }

  function moveTab(from: number, to: number): void {
    const next = [...tabs]
    const [t] = next.splice(from, 1)
    next.splice(to, 0, t)
    tabs = next
  }

  // Ctrl+Tab walks the most-recently-used list while Ctrl is held; letting
  // go of Ctrl makes the file it landed on the most recent.
  let cycling = false
  let cycleAt = 0
  function cycle(step: number): void {
    if (mru.length < 2) return
    if (!cycling) {
      cycling = true
      cycleAt = 0
    }
    cycleAt = (cycleAt + step + mru.length) % mru.length
    openFile(mru[cycleAt])
  }
  function endCycle(): void {
    if (!cycling) return
    cycling = false
    if (active) mru = [active, ...mru.filter((r) => r !== active)]
  }

  /** App-wide keys, caught before the editor sees them. */
  function onkeydown(e: KeyboardEvent): void {
    if (vault && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'ArrowLeft') goBack()
      else goForward()
      return
    }
    // Alt+PageUp / Alt+PageDown: the paper's previous or next file.
    if (vault && e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
      const target = neighbour(e.key === 'PageDown' ? 1 : -1)
      if (target) {
        e.preventDefault()
        e.stopPropagation()
        go(target)
      }
      return
    }
    if (!vault || !e.ctrlKey || e.metaKey) return
    const key = e.key.toLowerCase()
    const plain = !e.shiftKey && !e.altKey
    let handled = true
    if (key === 'tab') cycle(e.shiftKey ? -1 : 1)
    else if ((key === 'pageup' || key === 'pagedown') && plain) {
      const i = active ? tabs.indexOf(active) : -1
      if (tabs.length) openFile(tabs[(i + (key === 'pagedown' ? 1 : -1) + tabs.length) % tabs.length])
    } else if (key === 'w' && plain) {
      if (active) closeTab(active)
    } else if (key === 'p' && plain) quickOpen = true
    else if (key === 's' && e.altKey && !e.shiftKey) saveAll()
    else if (key === 'h' && e.shiftKey && !e.altKey) openSearch()
    else if (key === 'c' && e.shiftKey && !e.altKey) openCitePicker()
    else if (key === 'j' && plain) togglePanel()
    else if (key === 'j' && e.altKey && !e.shiftKey) syncForward()
    else if (key === 'v' && e.altKey && !e.shiftKey) togglePdf()
    else if (key === 'b' && e.shiftKey && !e.altKey) sideOpen = !sideOpen
    else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  function onkeyup(e: KeyboardEvent): void {
    if (e.key === 'Control') endCycle()
  }

  // Quick open lists text files and images.
  const openable = $derived(vault ? allFiles(vault.tree).filter((f) => TEXT_FILE.test(f) || isImage(f)) : [])

  /**
   * Gives the math preview the macros of the document `rel` belongs to, and
   * completion its commands and environments.
   */
  async function loadMacros(rel: string): Promise<void> {
    if (!rel.endsWith('.tex')) return
    const [{ macros }, ctx] = await Promise.all([
      window.api.mathMacros(rel).catch(() => ({ macros: {} })),
      window.api.editorContext(rel).catch(() => null),
    ])
    if (rel !== active) return
    editor?.setMacros(macros)
    if (ctx) context = ctx
    loadPaper(rel)
    await loadBib(rel)
  }

  // A class file open from the vault gets a banner offering to move it to the
  // global template folder. "Not now" hides it for that file until the app
  // restarts, so a new template can be worked on in place first.
  let keptInVault = $state(new Set<string>())
  const offerMove = $derived(!!active && active.toLowerCase().endsWith('.cls') && !keptInVault.has(active))

  async function moveActiveToGlobal(): Promise<void> {
    const rel = active
    if (!rel || !editor) return
    if (dirty.has(rel)) await window.api.writeFile(rel, editor.currentText())
    const to = await window.api.moveToGlobalTemplates(rel).catch((e: Error) => (flash(`Couldn't move ${rel}: ${e.message}`), null))
    if (!to) return
    forgetTab(rel)
    flash(`Moved to ${to}`)
  }

  function setDirty(rel: string, isDirty: boolean): void {
    if (isDirty === dirty.has(rel)) return
    if (isDirty) dirty.add(rel)
    else dirty.delete(rel)
    dirty = new Set(dirty)
  }

  // --- Vault-wide search, replace and label rename -------------------------

  let searchPanel = $state<SearchPanel>()
  // Bumped when files change, so the search panel searches again.
  let searchVersion = $state(0)
  let renaming = $state<string | null>(null)

  // --- Table editor ---------------------------------------------------------

  /** The table being edited: where it is (`from` = `to` for a new one) and its model. */
  let tableEdit = $state<{ rel: string; from: number; to: number; source: string; model: TableModel; startRow: number; isNew: boolean } | null>(null)

  /**
   * Opens the table editor on the table at `range` in the open file, or a
   * new table at the cursor. Pasted spreadsheet cells (`grid`) go in after
   * the cursor's row of an existing table, or fill a new one.
   */
  function editTable(range: { from: number; to: number } | null, grid: string[][] | null): void {
    if (!editor || !active) return
    const text = editor.docText()
    if (range) {
      const source = text.slice(range.from, range.to)
      const model = parseTable(source)
      if (model) {
        let m = model
        let startRow = 0
        if (grid) {
          // Which row the cursor is in: the \\ row ends before it (after the tabular's own start).
          const tab = source.search(/\\begin\s*\{tabular/)
          const before = text.slice(range.from + Math.max(0, tab), editor.cursorPos())
          const at = editor.cursorPos() < range.from + tab ? m.rows.length : Math.min((before.match(/\\\\/g) ?? []).length + 1, m.rows.length)
          for (let i = 0; i < grid.length; i++) m = insertRow(m, at)
          m = pasteGrid(m, at, 0, grid)
          startRow = at
        }
        tableEdit = { rel: active, ...range, source, model: m, startRow, isNew: false }
        return
      }
      flash("This table has comments or a layout the table editor can't show; edit it as source")
      if (!grid) return
    }
    const pos = editor.cursorPos()
    const empty = [['', '', ''], ['', '', ''], ['', '', '']]
    tableEdit = { rel: active, from: pos, to: pos, source: '', model: newTable(grid ?? empty), startRow: 0, isNew: true }
  }

  async function applyTable(model: TableModel): Promise<void> {
    const t = tableEdit
    tableEdit = null
    if (!t || !editor) return
    if (active !== t.rel) await openFile(t.rel)
    const text = editor.docText()
    if (!t.isNew && text.slice(t.from, t.to) !== t.source) return flash("The table changed while the editor was open; nothing was applied")
    const lineStart = text.lastIndexOf('\n', t.from - 1) + 1
    const lead = text.slice(lineStart, t.from)
    const indent = /^[ \t]*$/.test(lead) ? lead : (/^[ \t]*/.exec(lead)?.[0] ?? '')
    const out = serializeTable(model, indent)
    if (t.isNew) editor.insertBlock(out)
    else editor.replaceRange(t.from, t.to, /^[ \t]*$/.test(lead) ? out.slice(indent.length) : out)
    await ensurePackages(packagesFor(model))
  }

  /** A package to load, with options only where they matter (\usepackage[T1]{fontenc}). */
  type PackageSpec = string | { name: string; options: string }

  /**
   * The packages of `pkgs` the open document doesn't load yet (itself, or
   * through its class, per the last build's log), and the document to add
   * them to; null when there's no document.
   */
  async function missingPackages(pkgs: PackageSpec[]): Promise<{ root: string; text: string; missing: PackageSpec[] } | null> {
    if (!active) return null
    const root = await rootOfActive()
    if (!root) return null
    const text = normalizeEol(await textOf(root))
    const log = result?.root === root ? result.log : ''
    const loads = (p: PackageSpec) => {
      if (typeof p !== 'string') {
        // Font encodings: \usepackage[T1]{fontenc} writes t1enc.def into the log.
        return new RegExp(String.raw`[\\/]${p.options.toLowerCase()}enc\.def`, 'i').test(log) || new RegExp(String.raw`\\usepackage\s*\[[^\]]*\b${p.options}\b[^\]]*\]\s*\{${p.name}\}`).test(text)
      }
      return new RegExp(String.raw`[\\/]${p}\.sty`).test(log) || new RegExp(String.raw`\\(usepackage|RequirePackage)\s*(\[[^\]]*\])?\s*\{[^}]*\b${p}\b`).test(text)
    }
    return { root, text, missing: pkgs.filter((p) => !loads(p)) }
  }

  /**
   * Adds the \usepackage lines for `pkgs` to the document's preamble, unless
   * the document (or its class, per the last build's log) loads them.
   */
  async function ensurePackages(pkgs: PackageSpec[]): Promise<void> {
    if (!pkgs.length) return
    const found = await missingPackages(pkgs)
    if (!found || !found.missing.length) return
    const { root, text, missing } = found
    const line = (p: PackageSpec) => (typeof p === 'string' ? `\\usepackage{${p}}` : `\\usepackage[${p.options}]{${p.name}}`)
    const begin = text.search(/^[^%\n]*\\begin\s*\{document\}/m)
    const preamble = begin < 0 ? text : text.slice(0, begin)
    const uses = [...preamble.matchAll(/^[^%\n]*\\usepackage.*$/gm)]
    const cls = /^[^%\n]*\\documentclass.*$/m.exec(preamble)
    const anchor = uses.at(-1) ?? cls
    if (!anchor) return
    const at = anchor.index! + anchor[0].length
    await editor?.applyChangesTo(root, [{ from: at, to: at, insert: missing.map((p) => `\n${line(p)}`).join('') }])
    addTab(root)
    flash(`Added ${missing.map(line).join(', ')} to ${root.split('/').pop()}`)
  }

  // --- Symbols ----------------------------------------------------------------

  // textcomp has been part of LaTeX itself since 2020, so it's never added.
  const symbolPackages = (s: LibrarySymbol): PackageSpec[] => [
    ...(s.fontenc ? [{ name: 'fontenc', options: s.fontenc }] : []),
    ...(s.package && s.package !== 'textcomp' ? [s.package] : []),
  ]

  /**
   * The packages and font encodings the open document loads: its own
   * \usepackage lines, and (from the last build's log) what its class
   * loads. Null when no document is open.
   */
  async function loadedPackages(): Promise<{ packages: Set<string>; encodings: Set<string> } | null> {
    if (!active) return null
    const root = await rootOfActive()
    if (!root) return null
    const text = normalizeEol(await textOf(root).catch(() => ''))
    const log = result?.root === root ? result.log : ''
    const packages = new Set<string>()
    const encodings = new Set<string>()
    for (const m of blankComments(text).matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) {
      for (const name of m[2].split(',')) packages.add(name.trim())
      if (m[2].includes('fontenc')) for (const o of (m[1] ?? '').split(',')) encodings.add(o.trim().toUpperCase())
    }
    for (const m of log.matchAll(/[\\/]([A-Za-z0-9-]+)\.sty\b/g)) packages.add(m[1])
    for (const m of log.matchAll(/[\\/]([A-Za-z0-9]+)enc\.def\b/gi)) encodings.add(m[1].toUpperCase())
    return { packages, encodings }
  }

  const symbolActions: SymbolActions = {
    insert(s) {
      if (!editor || !active) return flash('Open a document to insert a symbol')
      // A math symbol in text goes in $…$; a text symbol in math, in \text{…}.
      const text = editor.docText()
      const pos = editor.cursorPos()
      const math = !!mathAtCursor(text, findMathRegions(text), pos)
      let insert = s.mode === 'math' && !math ? `$${s.command}$` : s.mode === 'text' && math ? `\\text{${s.command}}` : s.command
      // \alpha straight before a letter would run into it.
      if (/[A-Za-z]$/.test(insert) && /^[A-Za-z]/.test(text.slice(pos, pos + 1))) insert += ' '
      editor.insertAtCursor(insert)
      editor.focus()
      // And what it needs, if the document doesn't load it yet.
      if (s.package || s.fontenc) ensurePackages(symbolPackages(s))
    },
    addPackage: (s) => ensurePackages(symbolPackages(s)),
    hasPackage: async (s) => ((await missingPackages(symbolPackages(s)))?.missing.length ?? 1) === 0,
    loadedPackages,
    note: (message) => flash(message),
  }

  /** Unsaved buffers, which search reads instead of the disk copies. */
  const overrides = () => Object.fromEntries(editor?.dirtyTexts() ?? [])

  async function openSearch(): Promise<void> {
    view = 'search'
    sideOpen = true
    await tick()
    searchPanel?.focusWith(editor?.selectedText() ?? '')
  }

  /** Adds a tab for `rel` without switching to it. */
  function addTab(rel: string): void {
    if (!tabs.includes(rel)) tabs = [...tabs, rel]
  }

  const textOf = async (rel: string) => editor?.textOf(rel) ?? (await window.api.readFile(rel))

  async function openMatch(rel: string, m: SearchMatch): Promise<void> {
    await go(rel)
    editor?.select(m.from, m.to)
  }

  /**
   * Replaces matches of the search, searching each file's current text again
   * first (it may have changed since the results were shown). The changed
   * files open as unsaved tabs; each is one undoable change.
   */
  async function replaceMatches(query: string, opts: SearchOptions, replacement: string, files: string[] | null, one?: SearchMatch): Promise<void> {
    const targets = files ?? (await window.api.search(query, opts, overrides())).files.map((f) => f.rel)
    let count = 0
    let changed = 0
    for (const rel of targets) {
      let matches = searchText(await textOf(rel), query, opts)
      if (one) matches = matches.filter((m) => m.from === one.from && m.to === one.to)
      if (!matches.length) continue
      await editor?.applyChangesTo(rel, replacementChanges(matches, replacement))
      addTab(rel)
      count += matches.length
      changed++
    }
    searchVersion++
    if (one && targets[0]) await openFile(targets[0])
    else if (count) flash(`Replaced ${count} in ${changed} file${changed === 1 ? '' : 's'}, unsaved. Ctrl+Alt+S saves all`)
  }

  /** Where F2 renames a label: the open paper's files, or (outside a paper) the whole vault. */
  const renameScope = () => (paper?.declared && inPaper(active) ? new Set(paper.files.map((f) => f.rel)) : null)

  /** F2: renames a label, and every reference to it, across the paper (or the vault). */
  async function renameLabel(from: string, to: string): Promise<void> {
    renaming = null
    to = to.trim()
    if (!to || to === from) return
    if (/[\s{}\\%#,]/.test(to)) return flash(`"${to}" can't be a label: no spaces, braces, commas, \\, % or #`)
    const literal: SearchOptions = { regex: false, caseSensitive: true, wholeWord: false, includeComments: true }
    const scope = renameScope()
    const inScope = (rel: string) => !scope || scope.has(rel)
    const exists = (await window.api.search(`{${to}}`, literal, overrides())).files.some((f) => inScope(f.rel))
    if (exists) return flash(`A label or reference "${to}" already exists`)
    const hits = await window.api.search(from, literal, overrides())
    let count = 0
    let changed = 0
    for (const { rel } of hits.files.filter((f) => inScope(f.rel))) {
      const changes = renameKeyChanges(await textOf(rel), from, to)
      if (!changes.length) continue
      await editor?.applyChangesTo(rel, changes)
      addTab(rel)
      count += changes.length
      changed++
    }
    searchVersion++
    flash(`Renamed ${from} → ${to}: ${count} place${count === 1 ? '' : 's'} in ${changed} file${changed === 1 ? '' : 's'}, unsaved`)
  }

  async function save(rel: string, text: string): Promise<void> {
    await window.api.writeFile(rel, text)
    if (active && (rel === active || paper?.files.some((f) => f.rel === rel))) loadPaper(active)
    searchVersion++
    await reloadIfSettings(rel)
    if (COMPILES.test(rel)) await compile(rel, true)
  }

  // Section builds: a file of a marked paper builds just its section (the
  // file the root \inputs that it's in), unless the whole paper is asked for.
  const SECTION_KEY = 'endleaf-section-builds'
  let sectionBuilds = $state((() => {
    try {
      return localStorage.getItem(SECTION_KEY) !== 'false'
    } catch {
      return true
    }
  })())
  function setSectionBuilds(on: boolean): void {
    sectionBuilds = on
    try {
      localStorage.setItem(SECTION_KEY, String(on))
    } catch {
      // not remembered; fine
    }
    if (active) {
      if (on) preview(active, true)
      else compile(active)
    }
  }

  /** What a section build of `rel` builds: the root's include it's in, where its numbers start, its name. */
  function sectionOf(rel: string): SectionTarget | null {
    const p = paper
    const model = paperModel
    if (!p?.declared || !model || rel === p.root || !inPaper(rel)) return null
    let f = fileOf(rel)
    while (f && f.parent && f.parent !== p.root) f = fileOf(f.parent)
    if (!f || f.off || f.parent !== p.root) return null
    const start = model.files.get(f.rel)?.start
    if (!start) return null
    const s = model.sectionsOf(f.rel)
    return { unit: f.rel, start: $state.snapshot(start), label: s ? `§${s}` : f.rel.split('/').pop()! }
  }
  /** The section-or-paper switch over the PDF, for a file of a marked paper. */
  const pdfScope = $derived.by(() => {
    if (!active) return null
    const t = sectionOf(active)
    return t ? { label: t.label, section: sectionBuilds, onchange: setSectionBuilds } : null
  })

  /**
   * Builds `rel`'s document. `saving`: Ctrl+S, which builds just the section
   * for a file of a marked paper when that's enough (the main process decides).
   */
  async function compile(rel: string, saving = false): Promise<void> {
    clearTimeout(previewTimer) // this build includes whatever the preview would have
    const seq = ++compileSeq
    compiling = true
    previewing = false
    try {
      const target = saving && sectionBuilds ? sectionOf(rel) : null
      const r = target ? await window.api.compileSection(rel, {}, target, true) : await window.api.compile(rel)
      if (!r) return
      if (seq !== compileSeq) return // a newer save superseded this compile
      show(r)
    } finally {
      if (seq === compileSeq) compiling = false
    }
  }

  function show(r: CompileResult): void {
    const hadErrors = (result?.problems ?? []).some((p) => p.severity === 'error' && !p.hidden)
    result = r
    if (!hadErrors && r.problems.some((p) => p.severity === 'error' && !p.hidden)) {
      panelOpen = true
      panelTab = 'problems'
    }
    editor?.setProblems(r.problems)
    if (active) loadMacros(active) // the preamble or a template may have changed
    if (r.pdf) {
      pdf = r.pdf
      pdfVersion++
    }
  }

  // Preview: a pause in typing builds the unsaved text (without saving it)
  // so the PDF keeps up. Ctrl+S still saves and publishes to pdf/.
  const PREVIEW_DELAY_MS = 1200
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  function schedulePreview(rel: string): void {
    if (!COMPILES.test(rel)) return
    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => preview(rel), PREVIEW_DELAY_MS)
  }

  async function preview(rel: string, force = false): Promise<void> {
    if (!editor) return
    // A saved build is running: try again after it, which may make this unnecessary.
    if (compiling) return schedulePreview(rel)
    const buffers = Object.fromEntries(editor.dirtyTexts())
    // Nothing unsaved, and the PDF already shows the saved files.
    if (!force && !Object.keys(buffers).length && !result?.draft) return
    const seq = ++compileSeq
    previewing = true
    try {
      const target = sectionBuilds ? sectionOf(rel) : null
      const r = target ? await window.api.compileSection(rel, buffers, target, false) : await window.api.compileDraft(rel, buffers)
      if (seq !== compileSeq || !r) return
      show(r)
    } finally {
      if (seq === compileSeq) previewing = false
    }
  }

  const outsideVault = (file: string) => /^[a-zA-Z]:|^\//.test(file)

  async function jumpTo(p: Problem): Promise<void> {
    if (!p.file) return
    if (outsideVault(p.file)) {
      flash(`That's in ${p.file.split(/[\\/]/).pop()}, outside this vault`)
      return
    }
    await go(p.file, p.line ?? undefined)
  }

  /**
   * Applies a quick fix: each file's edits go in as one undoable change, the
   * file is saved, and the save recompiles as usual. Ctrl+Z undoes it.
   */
  async function applyFix(fix: QuickFix): Promise<void> {
    const byFile = new Map<string, TextEdit[]>()
    for (const e of fix.edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e])
    for (const [file, edits] of byFile) {
      if (outsideVault(file)) {
        flash(`Can't apply: ${file.split(/[\\/]/).pop()} is outside this vault`)
        return
      }
      await openFile(file)
      if (!editor?.applyEdits(edits)) {
        flash(`Couldn't apply "${fix.label}": the text has changed since the last compile`)
        return
      }
      editor.saveCurrent()
    }
  }

  /** Source → PDF: highlight where the cursor's line appears. */
  async function syncForward(): Promise<void> {
    if (!pdf || !active || !editor) return
    pdfOpen = true
    const target = await window.api.syncForward(pdf, active, editor.cursorLine())
    if (target) viewer?.show(target)
    else flash(`${active} isn't part of the PDF being shown`)
  }

  /** PDF → source: open the file and line behind a double-clicked point. */
  async function syncInverse(page: number, x: number, y: number): Promise<void> {
    if (!pdf) return
    const loc = await window.api.syncInverse(pdf, page, x, y)
    if (!loc) return
    if (/^[a-zA-Z]:|^\//.test(loc.file)) {
      flash(`That comes from ${loc.file.split(/[\\/]/).pop()}:${loc.line}, outside this vault`)
      return
    }
    await go(loc.file, loc.line)
  }

  function startDrag(ev: PointerEvent): void {
    const target = ev.currentTarget as HTMLElement
    target.setPointerCapture(ev.pointerId)
    const box = editors!.getBoundingClientRect()
    const move = (m: PointerEvent) => (split = Math.min(0.8, Math.max(0.2, (m.clientX - box.left) / box.width)))
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true })
  }
</script>

<svelte:window
  onkeydowncapture={onkeydown}
  {onkeyup}
  onblur={endCycle}
  onmouseup={(e) => {
    // The mouse's own back and forward buttons.
    if (e.button === 3) goBack()
    else if (e.button === 4) goForward()
  }}
/>

<div class="window">
  <TitleBar
    {logo}
    vaultName={vault?.name ?? null}
    file={active}
    {place}
    nav={vault ? { canBack: backStack.length > 0, canForward: forwardStack.length > 0, onback: goBack, onforward: goForward } : null}
    {live}
    canLive={!!active?.toLowerCase().endsWith('.tex')}
    {pdfOpen}
    {panelOpen}
    {build}
    onrunning={() => vault && (quickOpen = true)}
    onlive={(on) => editor?.setLiveMode(on)}
    ontogglepdf={togglePdf}
    ontogglepanel={() => togglePanel()}
    onribbon={() => togglePanel('problems')}
  />

  {#if !started}
    <div class="starting"></div>
  {:else if !vault}
    <Welcome
      onopen={openVault}
      onopenat={(root) => switchVault(() => window.api.openVaultAt(root))}
      onnew={() => switchVault(() => window.api.newVault())}
    />
    {#if note}<div class="note welcome-note">{note}</div>{/if}
  {:else}
    <div class="work" bind:this={work} style:grid-template-columns="52px {sideOpen ? `${sideWidth}px 0` : '0 0'} minmax(0, 1fr)">
      <ActivityBar views={VIEWS} {tools} current={view} open={sideOpen} {swatch} {logo} onselect={showView} />

      <aside class="sidebar" hidden={!sideOpen}>
        <!-- Each view stays mounted, so search keeps its query and results. -->
        <div class="side-body" hidden={view !== 'files'}>
          <section class="sec grow" class:open={filesSection}>
            <button class="sec-h" onclick={() => (filesSection = !filesSection)}>
              <Icon name="chev" size={12} /><span class="t">{vault.name}</span>
            </button>
            {#if filesSection}<div class="sec-b"><FileTree nodes={vault.tree} {active} {dirty} onopen={(rel) => go(rel)} /></div>{/if}
          </section>
        </div>
        <!-- Contents: the open file's outline, or the paper map for a file of a marked paper. -->
        <div class="side-body contents-view" hidden={view !== 'contents'}>
          {#if active?.endsWith('.tex')}
            {#if paper && !paper.declared && paper.files.length > 1}
              <div class="paper-offer">
                <span><strong>{paper.root.split('/').pop()}</strong> brings in {paper.files.length - 1} other file{paper.files.length === 2 ? '' : 's'}. Treat it as a multi-part paper, so each file builds it and numbers as part of it?</span>
                <button onclick={() => markPaper(true)}>Mark as paper</button>
              </div>
            {/if}
            {#if paper?.declared && inPaper(active)}
              <PaperMap
                {paper}
                model={paperModel}
                {active}
                {cursorLine}
                activeOutline={outlineItems}
                {renames}
                onrenumber={renumber}
                ondismissrenumber={() => (keptOrder = new Set(keptOrder).add(JSON.stringify(renames)))}
                actions={paperActions}
              />
              {#if trashOffer}
                {@const t = trashOffer}
                <div class="paper-offer">
                  <span><strong>{t.rel.split('/').pop()}</strong> is now part of {t.into.split('/').pop()}, and nothing includes it. Send it to the Recycle Bin?</span>
                  <span class="row">
                    <button onclick={trashPutBack}>Send to Recycle Bin</button>
                    <button onclick={() => (trashOffer = null)}>Keep it</button>
                  </span>
                </div>
              {/if}
              {#if lastRenumber}
                <div class="paper-offer">
                  <span>Renumbered {lastRenumber.length} file{lastRenumber.length === 1 ? '' : 's'}.</span>
                  <span class="row">
                    <button onclick={undoRenumber}>Undo</button>
                    <button onclick={() => (lastRenumber = null)}>Done</button>
                  </span>
                </div>
              {/if}
            {:else}
              <Outline items={outlineItems} {cursorLine} onjump={(line) => active && go(active, line)} />
            {/if}
          {:else}
            <p class="side-empty">Open a .tex file to see its contents.</p>
          {/if}
        </div>
        <div class="side-body" hidden={view !== 'search'}>
          <SearchPanel
            bind:this={searchPanel}
            search={(q, o) => window.api.search(q, o, overrides())}
            version={searchVersion}
            onopen={openMatch}
            onreplace={replaceMatches}
            paper={paper?.declared && inPaper(active) ? { name: paper.name, files: paper.files.map((f) => f.rel) } : null}
          />
        </div>
        <div class="side-body" hidden={view !== 'symbols'}>
          <SymbolPanel actions={symbolActions} active={sideOpen && view === 'symbols'} docKey="{active}|{pdfVersion}|{searchVersion}|{result?.root}" />
        </div>
        {#if view === 'cite'}
          <div class="side-body">
            <CitationsView
              {bib}
              oncite={(key) => insertCitation([key])}
              onopen={(file, line) => go(file, line)}
            />
          </div>
        {:else if view === 'appearance'}
          <div class="side-body">
            <AppearancePanel
              app={appearance}
              endpaper={vault.appearance}
              vaultName={vault.name}
              onapp={setAppearance}
              onvault={setEndpaper}
              ondefaults={restoreDefaults}
            />
          </div>
        {/if}
      </aside>
      <div class="splitter v" hidden={!sideOpen} role="separator" aria-orientation="vertical" onpointerdown={dragSidebar}></div>

      <div class="main" bind:this={mainArea} style:grid-template-rows="minmax(0, 1fr) {panelOpen ? `0 ${panelHeight}px` : '0 0'}">
        <div class="editors" class:spread={showPdf} bind:this={editors} style:grid-template-columns={showPdf ? `${split}fr 0 ${1 - split}fr` : '1fr 0 0'}>
          <section class="editor-pane">
            {#if offerMove && active}
              {@const file = active.split('/').pop()}
              <div class="banner">
                <span>
                  <strong>{file}</strong> is a template. Move it to the global template folder so every vault can use it?
                  {#if vault.globalTemplates}<span class="where" title={vault.globalTemplates}>{vault.globalTemplates}</span>{/if}
                </span>
                <span class="spacer"></span>
                <button onclick={moveActiveToGlobal}>Move</button>
                <button onclick={() => (keptInVault = new Set(keptInVault).add(active!))} title="Keep editing it here; asked again next time the app starts">Not now</button>
              </div>
            {/if}
            {#if appearance.look === 'plain'}<TabBar {tabs} {active} {dirty} papers={paperTabs} onselect={(rel) => go(rel)} onclose={closeTab} onmove={moveTab} />{/if}
            <div class="editor">
              {#if appearance.look === 'bench'}
                <IndexTabs {tabs} {active} {dirty} papers={paperTabs} edge={appearance.tabs} onselect={(rel) => go(rel)} onclose={closeTab} />
              {/if}
              <Editor
                bind:this={editor}
                onsave={save}
                ondirtychange={setDirty}
                onsyncforward={syncForward}
                {imageHooks}
                {editingHooks}
                {spellHooks}
                onoutline={(items) => {
                  outlineItems = items
                  // The map's headings and numbers follow the open file's edits.
                  if (inPaper(active)) rebuildPaperModel()
                }}
                oncursor={(line, col) => ((cursorLine = line), (cursorCol = col))}
                onlivechange={(on) => (live = on)}
                onedit={schedulePreview}
                {livePaper}
                onopenlocation={(loc) => go(loc.file, loc.line)}
              />
            </div>
            {#if !active}<EmptyPlate logo={logoUrl(endpaper.palette, 'mid')} />{/if}
            {#if note}<div class="note">{note}</div>{/if}
          </section>
          <div class="splitter v" hidden={!showPdf} role="separator" aria-orientation="vertical" onpointerdown={startDrag}></div>
          <section class="pdf-pane" hidden={!showPdf}>
            <PdfViewer bind:this={viewer} {pdf} version={pdfVersion} scope={pdfScope} onsyncclick={syncInverse} onclose={() => (pdfOpen = false)} />
          </section>
        </div>
        <div class="splitter h" hidden={!panelOpen} role="separator" aria-orientation="horizontal" onpointerdown={dragPanel}></div>
        {#if panelOpen}
          <ProblemsPanel {result} bind:tab={panelTab} onjump={jumpTo} onfix={applyFix} onclose={() => (panelOpen = false)} />
        {/if}
      </div>
    </div>

    <StatusBar
      vaultName={vault.name}
      {swatch}
      {branch}
      section={active?.endsWith('.tex') ? section : null}
      cursor={active ? { line: cursorLine, col: cursorCol } : null}
      live={active?.toLowerCase().endsWith('.tex') ? live : null}
      spelling={spellOn}
      problems={problemCounts}
      onendpaper={() => showView('appearance')}
      onsection={() => {
        view = 'contents'
        sideOpen = true
      }}
      onlive={() => editor?.toggleLiveMode()}
      onspelling={() => setSpelling(!spellOn)}
      onproblems={() => togglePanel('problems')}
    />
  {/if}
</div>

{#if tableEdit && editor}
  <TableEditor
    initial={tableEdit.model}
    title={tableEdit.isNew ? 'New table' : 'Edit table'}
    render={editor.mathRenderer()}
    startRow={tableEdit.startRow}
    onapply={applyTable}
    oncancel={() => {
      tableEdit = null
      editor?.focus()
    }}
  />
{/if}

{#if renaming}
  {@const from = renaming}
  <PromptDialog
    title="Rename label {from}"
    initial={from}
    hint={`Changes the \\label and every reference to it in ${renameScope() ? `${paper?.name}'s files` : 'the vault'}. The files are left unsaved.`}
    onsubmit={(to) => renameLabel(from, to)}
    oncancel={() => {
      renaming = null
      editor?.focus()
    }}
  />
{/if}

{#if paperPrompt}
  {@const pp = paperPrompt}
  <PromptDialog
    title={pp.title}
    initial={pp.initial}
    hint={pp.hint}
    onsubmit={(v) => pp.run(v)}
    oncancel={() => {
      paperPrompt = null
      editor?.focus()
    }}
  />
{/if}

{#if quickOpen}
  <QuickOpen
    files={openable}
    onpick={(rel) => {
      quickOpen = false
      go(rel)
    }}
    onclose={() => {
      quickOpen = false
      editor?.focus()
    }}
  />
{/if}

{#if citePicker && bib}
  <CitePicker
    info={bib}
    onpick={insertCitation}
    onclose={() => {
      citePicker = false
      editor?.focus()
    }}
  />
{/if}

{#if picker}
  <ImagePicker
    {images}
    initial={picker.initial}
    title={picker.mode === 'insert' ? 'Insert image' : 'Images in this vault'}
    onpick={picker.mode === 'insert' ? pickImage : undefined}
    onclose={() => {
      picker = null
      editor?.focus() // so typing continues where it left off
    }}
  />
{/if}

<style>
  .window {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--paper);
  }

  .starting {
    flex: 1;
  }
  .work {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
  }

  /* the sidebar: the flat side tone in the Plain look */
  /* Each pane keeps its own column, so hiding the sidebar or PDF doesn't shift the others. */
  .work > :global(.activity) {
    grid-column: 1;
  }
  .sidebar {
    grid-column: 2;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--side);
    box-shadow: inset -1px 0 0 var(--line);
  }
  .sidebar[hidden] {
    display: none;
  }
  .side-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .side-body[hidden] {
    display: none;
  }
  .sec {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sec.grow.open {
    flex: 1;
  }
  .contents-view {
    padding-top: 6px;
  }
  .side-empty {
    margin: 8px 12px;
    color: var(--ink-soft);
  }
  .sec-h {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 34px;
    padding: 0 6px 0 10px;
    border: 0;
    border-radius: 0;
    text-align: left;
    font: 600 14px var(--f-page);
    letter-spacing: 0.12em;
    font-variant-caps: all-small-caps;
    color: var(--ink-soft);
  }
  .sec-h:hover:not(:disabled) {
    background: none;
    color: var(--ink);
  }
  .sec-h :global(.ic) {
    transition: transform 0.15s;
  }
  .sec.open > .sec-h :global(.ic) {
    transform: rotate(90deg);
  }
  .sec-h .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sec-b {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  .paper-offer .row {
    display: flex;
    gap: 6px;
  }
  .paper-offer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    margin: 4px 8px 8px;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ink);
    background: color-mix(in srgb, var(--detail) 14%, var(--paper));
  }

  .splitter {
    position: relative;
    z-index: 5;
  }
  .splitter[hidden] {
    display: none;
  }
  .splitter::before {
    content: '';
    position: absolute;
    inset: 0 -4px;
    cursor: col-resize;
  }
  .splitter.h::before {
    inset: -4px 0;
    cursor: row-resize;
  }
  .splitter:hover::before {
    background: color-mix(in srgb, var(--detail) 35%, transparent);
  }

  .work > .splitter {
    grid-column: 3;
  }
  .editors > .splitter {
    grid-column: 2;
  }
  .pdf-pane {
    grid-column: 3;
  }
  .main {
    grid-column: 4;
    display: grid;
    min-width: 0;
    min-height: 0;
  }
  .editors {
    display: grid;
    min-height: 0;
    min-width: 0;
  }
  /*
   * The page column's geometry (docs/design/ENDLEAF.md, "The page column"),
   * from the measure (--textw) and this pane's width, so the tab bar above
   * the editor can line up with the page too:
   *   page  = textw / (1 − 7.5 % − 11 %), no wider than the desk allows
   *   inner = 7.5 % of the page, 24–64 px; outer = 11 %, 30–104 px
   * Bench adds the boards (and the edge stack on the right), and room for
   * the index tabs on the left.
   */
  .editor-pane {
    grid-column: 1;
    background: var(--desk);
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    position: relative;
    container-type: inline-size;
    --room-l: min(50px, 4cqw);
    --room-r: min(50px, 4cqw);
    --board-l: 0px;
    --board-r: 0px;
    --leaf-w: max(
      260px,
      min(calc(var(--textw, 606px) / 0.815), calc(100cqw - 14px - var(--room-l) - var(--room-r) - var(--board-l) - var(--board-r)))
    );
    /* where the book starts: its left board, then the page */
    --book-x: max(var(--room-l), calc((100cqw - 14px - var(--leaf-w) - var(--board-l) - var(--board-r)) / 2));
    --pad-l: clamp(24px, calc(var(--leaf-w) * 0.075), 64px);
    --pad-r: clamp(30px, calc(var(--leaf-w) * 0.11), 104px);
  }
  :global(:root[data-look='bench']) .editor-pane {
    --board-l: 18px;
    --board-r: 26px;
  }
  :global(:root[data-look='bench'][data-tabs='left']) .editor-pane {
    --room-l: 156px;
  }
  /* The open book: the page runs to the spine, its outer margin now on the left. */
  :global(:root[data-look='bench']) .editors.spread .editor-pane {
    --room-r: 0px;
    --board-r: 0px;
    --leaf-w: max(260px, calc(100cqw - 14px - var(--room-l) - var(--board-l)));
    --book-x: var(--room-l);
    --pad-l: clamp(30px, calc(var(--leaf-w) * 0.11), 104px);
    --pad-r: clamp(24px, calc(var(--leaf-w) * 0.075), 64px);
  }
  .editor {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
  /* Plain: the page starts at the tab bar, so the open tab runs on into it. */
  :global(:root[data-look='plain'] .cm-scroller) {
    padding-top: 0;
  }
  .pdf-pane {
    min-width: 0;
    min-height: 0;
    box-shadow: inset 1px 0 0 var(--line);
  }
  .pdf-pane[hidden] {
    display: block;
    visibility: hidden;
    width: 0;
    overflow: hidden;
  }
  .note {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100% - 32px);
    padding: 6px 14px;
    border-radius: 4px;
    color: var(--ink);
    background: color-mix(in srgb, var(--warn) 22%, var(--paper));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    z-index: 10;
    pointer-events: none;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    color: var(--ink);
    background: color-mix(in srgb, var(--detail) 14%, var(--paper));
    border-bottom: 1px solid var(--line);
  }
  .banner .where {
    display: block;
    color: var(--ink-soft);
    font-size: 12px;
  }
  .spacer {
    flex: 1;
  }
  .welcome-note {
    position: fixed;
    bottom: 24px;
  }
</style>
