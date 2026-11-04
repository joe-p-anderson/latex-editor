// First-time hints (.scratch/onboarding/spec.md, "First-time hints"): a
// dismissible strip under the title bar, one hint at a time, each shown at
// most once. Dismissals are stored in settings.json (dismissedHints);
// Help → Show Hints Again clears them. The spec caps the list at three:
// don't add a fourth without revisiting it.
//
// A hint's keys are command ids in braces ({file.save}), named from the
// command registry when shown (docs/adr/0001-one-command-registry.md).

export const HINTS = [
  {
    id: 'live-source',
    text: "You're in Live view: maths and formatting render as you type, and the line you're on shows its LaTeX. Switch to Source view for plain LaTeX ({view.toggleLive}).",
  },
  { id: 'first-build', text: 'Saving built your PDF. {file.save} builds, and {build.recompile} rebuilds without saving.' },
  { id: 'first-error', text: "Click an error to jump to its line. TeX's raw output is folded under each one." },
] as const

export type Hint = (typeof HINTS)[number]
export type HintId = Hint['id']

/** What `hint` says, its keys named by `keyFor` (a command id to "Ctrl+S", or null when it has none). */
export function hintText(hint: Hint, keyFor: (commandId: string) => string | null): string {
  return hint.text.replace(/\{([\w.:-]+)\}/g, (_, id: string) => keyFor(id) ?? 'its key')
}

/**
 * Which hint the strip shows, and the ones waiting behind it. Plain
 * TypeScript, so it can be unit-tested; the renderer mirrors it with `subscribe`.
 */
export class HintQueue {
  private dismissed: Set<string>
  /** Shown (or showing) this session, so a hint left undismissed isn't shown twice. */
  private shown = new Set<string>()
  private queue: HintId[] = []
  private listeners: (() => void)[] = []

  constructor(dismissed: readonly string[]) {
    this.dismissed = new Set(dismissed)
  }

  /** The hint on the strip, or null. */
  get current(): Hint | null {
    const id = this.queue[0]
    return id ? HINTS.find((h) => h.id === id)! : null
  }

  /** Something happened that `id` explains: show it, or queue it behind the one showing. */
  trigger(id: HintId): void {
    if (this.dismissed.has(id) || this.shown.has(id)) return
    this.shown.add(id)
    this.change(() => this.queue.push(id))
  }

  /** Closes the strip's hint; returns its id, to store, or null if none showed. */
  dismiss(): HintId | null {
    const id = this.queue[0] ?? null
    if (!id) return null
    this.dismissed.add(id)
    this.change(() => this.queue.shift())
    return id
  }

  /** The dismissals stored in settings, which may arrive after the first triggers. */
  setDismissed(ids: readonly string[]): void {
    for (const id of ids) this.dismissed.add(id)
    this.change(() => (this.queue = this.queue.filter((id) => !this.dismissed.has(id))))
  }

  /** Forgets every dismissal (Show Hints Again): each hint shows again when next triggered. */
  reset(): void {
    this.dismissed.clear()
    this.shown = new Set(this.queue)
  }

  subscribe(cb: () => void): () => void {
    this.listeners.push(cb)
    return () => (this.listeners = this.listeners.filter((l) => l !== cb))
  }

  private change(edit: () => void): void {
    const before = this.queue[0]
    edit()
    if (this.queue[0] !== before) for (const l of this.listeners) l()
  }
}
