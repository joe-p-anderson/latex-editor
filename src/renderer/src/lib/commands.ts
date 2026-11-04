// The command registry (docs/adr/0001-one-command-registry.md): every core
// and plugin command, from which the command palette and the keymap are
// generated. Plain TypeScript (no runes), so it can be unit-tested; App.svelte
// mirrors its changes into reactive state with `subscribe`.
import { fuzzyScore } from '@shared/images'
import type { MenuLabel } from '@shared/menu'

/** The menu a command goes in, which the palette names it by too. */
export type Category = MenuLabel

/**
 * A condition a command needs: a vault is open, a file is open in the
 * editor, a `.tex` file is, or TeX is installed so documents can build.
 */
export type Condition = 'vault' | 'editor' | 'tex' | 'build'

/** Which conditions hold now. */
export type Context = Record<Condition, boolean>

export interface Command {
  /** Stable id, e.g. `build.recompile`; a plugin's are `<plugin>:<id>`. */
  id: string
  /** What the palette and menus show, e.g. "Recompile". */
  title: string
  category: Category
  /** The plugin's name, for a plugin's command: the palette shows "Tools: Zotero: …". */
  group?: string
  /** Default key, in CodeMirror notation (`Mod-Shift-b`). */
  key?: string
  /** Other keys that run it too (Ctrl+Shift+H for Find in Vault); menus and the palette show only `key`. */
  aliases?: string[]
  /**
   * The key works only while the editor has focus (it's bound in the
   * editor, ahead of its own keymaps), not app-wide.
   */
  editorKey?: boolean
  /** Conditions that must all hold for the command to show or run. */
  when?: Condition[]
  /** What pressing its key says when its conditions don't hold ("Open a .tex file to cite"); without one the key falls through. */
  hint?: string
  /** The submenu of its menu it goes in ("Format" in Insert). */
  submenu?: string
  /** Its menu label when that depends on the context ("Save and Build" for a .tex file); otherwise `title`. */
  menuTitle?: (ctx: Context) => string
  /** False keeps it out of the menu bar (it's in the palette all the same). */
  menu?: false
  /** Other words the palette finds it by ("compile" for Recompile). */
  keywords?: string[]
  /** Returning false means it didn't apply, and a key falls through to whatever else binds it. */
  run(): void | boolean | Promise<void>
}

export const holds = (c: Command, ctx: Context): boolean => (c.when ?? []).every((w) => ctx[w])

/**
 * A plugin's command (`id` is `<plugin>:<id>`), for the registry: under
 * Tools with its plugin's name. It acts on the editor, so its key is bound
 * there and it needs a file open. One in Insert is one of that menu's items
 * instead, needing a .tex file like the others.
 */
export const pluginCommand = (c: { id: string; title: string; plugin: string; key?: string; category?: 'Insert' }, run: Command['run']): Command => ({
  id: c.id,
  title: c.title,
  ...(c.category ? { category: c.category, when: ['vault', 'tex'] } : { category: 'Tools', group: c.plugin, when: ['vault', 'editor'] }),
  key: c.key,
  editorKey: true,
  run,
})

export class CommandRegistry {
  private list: Command[] = []
  private listeners = new Set<() => void>()

  /**
   * `onError` is called with a failed command and its error (a rejected
   * promise or a throw); `onHint` with a command's hint, when its key is
   * pressed but it can't run.
   */
  constructor(
    private readonly onError: (c: Command, e: unknown) => void = (c, e) => console.error(`${c.id}:`, e),
    private readonly onHint: (hint: string) => void = () => {},
  ) {}

  /** Adds commands; the returned function removes them again. */
  register(...cmds: Command[]): () => void {
    for (const c of cmds) {
      if (this.get(c.id) || cmds.filter((x) => x.id === c.id).length > 1) throw new Error(`Command ${c.id} is already registered`)
    }
    this.list = [...this.list, ...cmds]
    this.changed()
    return () => {
      this.list = this.list.filter((c) => !cmds.includes(c))
      this.changed()
    }
  }

  get(id: string): Command | undefined {
    return this.list.find((c) => c.id === id)
  }

  all(): Command[] {
    return this.list
  }

  /** The commands that can run now, in registration order. */
  available(ctx: Context): Command[] {
    return this.list.filter((c) => holds(c, ctx))
  }

  /** Runs `id` if it's registered and its condition holds; whether it ran (and applied). */
  run(id: string, ctx: Context): boolean {
    const c = this.get(id)
    return !!c && holds(c, ctx) && this.call(c)
  }

  /**
   * Runs the command bound to the key `e` in `scope` (app-wide keys, or the
   * editor's), if its condition holds; failing that, shows the hint of one
   * that can't run. True if one ran and applied, or a hint was shown: the
   * caller then stops the event.
   */
  handleKey(e: KeyLike, ctx: Context, scope: 'app' | 'editor'): boolean {
    let hint: string | undefined
    for (const c of this.list) {
      if (!!c.editorKey !== (scope === 'editor')) continue
      if (![c.key, ...(c.aliases ?? [])].some((k) => k && keyMatches(k, e))) continue
      if (!holds(c, ctx)) hint ??= c.hint
      else if (this.call(c)) return true
    }
    if (hint === undefined) return false
    this.onHint(hint)
    return true
  }

  /** Calls `f` after each change; returns the way to stop. */
  subscribe(f: () => void): () => void {
    this.listeners.add(f)
    return () => void this.listeners.delete(f)
  }

  private call(c: Command): boolean {
    try {
      const r = c.run()
      if (r instanceof Promise) r.catch((e) => this.onError(c, e))
      return r !== false
    } catch (e) {
      this.onError(c, e)
      return true
    }
  }

  private changed(): void {
    for (const f of this.listeners) f()
  }
}

/** The parts of a KeyboardEvent a key binding looks at. */
export type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'> & { code?: string }

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** Whether `e` is the key `key` (CodeMirror notation: `Mod-Shift-b`, `Alt-ArrowLeft`, `F2`). */
export function keyMatches(key: string, e: KeyLike, mac = isMac): boolean {
  const parts = key.split(/-(?!$)/)
  const name = parts.pop()!
  const want = { ctrl: false, alt: false, shift: false, meta: false }
  for (const p of parts) {
    if (p === 'Mod') want[mac ? 'meta' : 'ctrl'] = true
    else if (p === 'Ctrl' || p === 'Control' || p === 'c') want.ctrl = true
    else if (p === 'Alt' || p === 'a') want.alt = true
    else if (p === 'Shift' || p === 's') want.shift = true
    else if (p === 'Meta' || p === 'Cmd' || p === 'm') want.meta = true
  }
  if (e.ctrlKey !== want.ctrl || e.altKey !== want.alt || e.shiftKey !== want.shift || e.metaKey !== want.meta) return false
  const same = (k: string) => (k.length === 1 ? k.toLowerCase() === name.toLowerCase() : k === name)
  if (same(e.key)) return true
  // With Alt (or AltGr) e.key can be another character: fall back to the physical key.
  const physical = /^(?:Key|Digit)(.)$/.exec(e.code ?? '')?.[1]
  return !!physical && name.length === 1 && physical.toLowerCase() === name.toLowerCase()
}

/** A key for people: `Mod-Shift-b` → "Ctrl+Shift+B". */
export function keyLabel(key: string, mac = isMac): string {
  return key
    .split(/-(?!$)/)
    .map((p) => (p === 'Mod' ? (mac ? 'Cmd' : 'Ctrl') : p.startsWith('Arrow') ? p.slice(5) : p.length === 1 ? p.toUpperCase() : p))
    .join('+')
}

/** How the palette names a command: "Build: Recompile", "Tools: Zotero: Sync Library". */
export const paletteLabel = (c: Command): string => [c.category, c.group, c.title].filter(Boolean).join(': ')

/**
 * The commands matching `query`, best first: a fuzzy match on the palette
 * label, or a keyword starting with it. An empty query keeps them all, in order.
 */
export function searchCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return cmds
  const scored = cmds.map((c, i) => {
    const label = fuzzyScore(q, paletteLabel(c))
    const keyword = c.keywords?.some((k) => k.toLowerCase().startsWith(q)) ? q.length * 4 : null
    const s = label === null ? keyword : keyword === null ? label : Math.max(label, keyword)
    return { c, i, s }
  })
  return scored
    .filter((x): x is { c: Command; i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c)
}
