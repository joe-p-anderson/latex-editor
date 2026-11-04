// endleaf's own commands, for the command registry (./commands.ts). Plugin
// commands are added by plugins.svelte.ts. App.svelte supplies the actions.
import type { Command, Condition } from './commands'

/** The editor's formatting and insert actions (run on its view; see EDITS in editing.ts). */
export type EditId =
  | 'bold'
  | 'italic'
  | 'emph'
  | 'inlineMath'
  | 'displayMath'
  | 'equation'
  | 'equation*'
  | 'align'
  | 'align*'
  | 'figure'
  | 'figure*'
  | 'table'
  | 'renameLabel'

/**
 * What the commands act through. The boolean ones return false when they
 * don't apply (a key then falls through); the void ones always apply.
 */
export interface CoreActions {
  newFile(): void
  switchVault(): void
  goToFile(): void
  /** Saves the open file (and builds it, if it's .tex); false with none. */
  save(): boolean
  saveAll(): void
  /** Closes the active tab; false with none (Ctrl+W then falls through). */
  closeTab(): boolean
  find(): void
  replace(): void
  findInVault(): void
  mathShortcuts(): void
  /** Runs an editor action on the open file; false if it didn't apply. */
  edit(id: EditId): boolean
  insertImage(): void
  cite(): void
  toggleLive(): void
  togglePdf(): void
  toggleSidebar(): void
  togglePanel(): void
  toggleSpelling(): void
  appearance(): void
  plugins(): void
  commandPalette(): void
  nextTab(): void
  previousTab(): void
  /** Ctrl+Tab: through the tabs most recently used first (forward, or back). */
  cycleTabs(step: 1 | -1): void
  goBack(): void
  goForward(): void
  /** The paper's next or previous file; false if there isn't one. */
  paperFile(step: 1 | -1): boolean
  /** Builds the active file without saving; false with none. */
  recompile(): boolean
  syncForward(): void
}

const V: Condition[] = ['vault']
const FILE: Condition[] = ['vault', 'editor']
const TEX: Condition[] = ['vault', 'tex']

/**
 * Runs an action that always applies. Whatever it returns is dropped (a
 * toggle's new state can be false, which would let the key fall through),
 * except a promise, so the registry still reports its failure.
 */
const always =
  (f: () => unknown) =>
  (): void | Promise<void> => {
    const r = f()
    if (r instanceof Promise) return r.then(() => undefined)
  }

export function coreCommands(a: CoreActions): Command[] {
  const insert = (id: string, title: string, edit: EditId, key?: string, submenu?: string): Command => ({
    id: `insert.${id}`,
    title,
    category: 'Insert',
    key,
    editorKey: true,
    when: TEX,
    run: () => a.edit(edit),
    ...(submenu ? { submenu } : {}),
  })
  return [
    // File
    { id: 'file.newFile', title: 'New File…', category: 'File', key: 'Mod-n', when: V, run: always(a.newFile) },
    { id: 'file.switchVault', title: 'Switch Vault…', category: 'File', key: 'Mod-o', keywords: ['open', 'folder'], run: always(a.switchVault) },
    { id: 'file.goToFile', title: 'Go to File…', category: 'File', key: 'Mod-p', keywords: ['open', 'quick open'], when: V, run: always(a.goToFile) },
    { id: 'file.save', title: 'Save', category: 'File', key: 'Mod-s', menuTitle: (ctx) => (ctx.tex ? 'Save and Build' : 'Save'), when: V, run: a.save },
    { id: 'file.saveAll', title: 'Save All', category: 'File', key: 'Mod-Alt-s', when: V, run: always(a.saveAll) },
    { id: 'file.closeTab', title: 'Close Tab', category: 'File', key: 'Mod-w', when: V, run: a.closeTab },

    // Edit
    { id: 'edit.find', title: 'Find', category: 'Edit', key: 'Mod-f', keywords: ['search'], when: V, run: always(a.find) },
    { id: 'edit.replace', title: 'Replace', category: 'Edit', key: 'Mod-h', when: V, run: always(a.replace) },
    { id: 'edit.findInVault', title: 'Find in Vault', category: 'Edit', key: 'Mod-Shift-f', aliases: ['Mod-Shift-h'], keywords: ['search'], when: V, run: always(a.findInVault) },
    { id: 'edit.renameLabel', title: 'Rename Label', category: 'Edit', key: 'F2', editorKey: true, when: TEX, run: () => a.edit('renameLabel') },
    { id: 'edit.mathShortcuts', title: 'Maths Shortcuts…', category: 'Edit', keywords: ['math', 'snippets'], when: V, run: always(a.mathShortcuts) },

    // Insert
    insert('bold', 'Bold', 'bold', 'Mod-b', 'Format'),
    insert('italic', 'Italic', 'italic', 'Mod-i', 'Format'),
    insert('emphasis', 'Emphasis', 'emph', 'Mod-e', 'Format'),
    insert('inlineMath', 'Inline Maths', 'inlineMath', 'Mod-m'),
    insert('displayMath', 'Display Maths', 'displayMath', 'Mod-Shift-m'),
    insert('equation', 'Equation Environment', 'equation', 'Mod-Shift-e'),
    insert('equationStar', 'Equation* Environment', 'equation*', 'Mod-Alt-e'),
    insert('align', 'Align Environment', 'align', 'Mod-Shift-a'),
    insert('alignStar', 'Align* Environment', 'align*', 'Mod-Alt-a'),
    insert('figure', 'Figure', 'figure', 'Mod-Alt-f'),
    insert('figureStar', 'Figure*', 'figure*'),
    insert('table', 'Table…', 'table', 'Mod-Alt-t'),
    { id: 'insert.image', title: 'Image…', category: 'Insert', keywords: ['picture', 'graphics'], when: TEX, run: always(a.insertImage) },
    { id: 'insert.cite', title: 'Citation…', category: 'Insert', key: 'Mod-Shift-c', keywords: ['cite', 'reference', 'bibliography'], when: TEX, hint: 'Open a .tex file to cite', run: always(a.cite) },

    // View
    { id: 'view.toggleLive', title: 'Live View', category: 'View', key: 'Mod-Shift-l', editorKey: true, keywords: ['source'], when: FILE, run: always(a.toggleLive) },
    { id: 'view.togglePdf', title: 'Toggle PDF', category: 'View', key: 'Mod-Alt-v', keywords: ['preview', 'build', 'compile'], when: V, run: always(a.togglePdf) },
    { id: 'view.toggleSidebar', title: 'Toggle Sidebar', category: 'View', key: 'Mod-Alt-b', when: V, run: always(a.toggleSidebar) },
    { id: 'view.togglePanel', title: 'Toggle Problems and Log', category: 'View', key: 'Mod-j', keywords: ['errors'], when: V, run: always(a.togglePanel) },
    { id: 'view.toggleSpelling', title: 'Toggle Spelling', category: 'View', keywords: ['spellcheck'], menu: false, run: always(a.toggleSpelling) },
    { id: 'view.appearance', title: 'Appearance', category: 'View', key: 'Mod-,', keywords: ['theme', 'palette', 'colour', 'color', 'font'], when: V, run: always(a.appearance) },
    { id: 'view.nextTab', title: 'Next Tab', category: 'View', key: 'Mod-PageDown', when: V, run: always(a.nextTab) },
    { id: 'view.previousTab', title: 'Previous Tab', category: 'View', key: 'Mod-PageUp', when: V, run: always(a.previousTab) },
    { id: 'view.recentTab', title: 'Recently Used Tab', category: 'View', key: 'Mod-Tab', menu: false, when: V, run: always(() => a.cycleTabs(1)) },
    { id: 'view.recentTabBack', title: 'Recently Used Tab (Back)', category: 'View', key: 'Mod-Shift-Tab', menu: false, when: V, run: always(() => a.cycleTabs(-1)) },
    { id: 'view.back', title: 'Go Back', category: 'View', key: 'Alt-ArrowLeft', when: V, run: always(a.goBack) },
    { id: 'view.forward', title: 'Go Forward', category: 'View', key: 'Alt-ArrowRight', when: V, run: always(a.goForward) },
    { id: 'view.previousPaperFile', title: "Paper's Previous File", category: 'View', key: 'Alt-PageUp', when: V, run: () => a.paperFile(-1) },
    { id: 'view.nextPaperFile', title: "Paper's Next File", category: 'View', key: 'Alt-PageDown', when: V, run: () => a.paperFile(1) },

    // Build
    { id: 'build.recompile', title: 'Recompile', category: 'Build', key: 'Mod-Shift-b', keywords: ['compile', 'build', 'pdf', 'typeset'], when: V, run: a.recompile },
    { id: 'build.syncForward', title: 'Show Cursor in PDF', category: 'Build', key: 'Mod-Alt-j', keywords: ['sync', 'synctex', 'pdf'], when: V, run: always(a.syncForward) },

    // Tools
    { id: 'tools.commandPalette', title: 'Run Command…', category: 'Tools', key: 'Mod-Shift-p', keywords: ['command palette'], run: always(a.commandPalette) },
    { id: 'tools.plugins', title: 'Plugins…', category: 'Tools', when: V, run: always(a.plugins) },
  ]
}
