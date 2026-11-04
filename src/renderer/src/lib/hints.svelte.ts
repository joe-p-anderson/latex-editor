// The first-time hints' state in the renderer: the queue (src/shared/hints.ts)
// mirrored into reactive state, with dismissals stored in settings.json.
import { HintQueue, type Hint, type HintId } from '@shared/hints'
import type { Command } from './commands'

const queue = new HintQueue([])
let current = $state<Hint | null>(null)
queue.subscribe(() => (current = queue.current))

// Dismissals come from settings; hints triggered before they arrive wait for them.
void window.api.dismissedHints().then((ids) => queue.setDismissed(ids))

/** The hint the strip shows, or null. */
export const currentHint = (): Hint | null => current

/** Something happened that a hint explains: shows it unless it was dismissed. */
export function triggerHint(id: HintId): void {
  queue.trigger(id)
}

/** Closes the strip's hint for good. */
export function dismissHint(): void {
  const id = queue.dismiss()
  if (id) void window.api.dismissHint(id)
}

/** Forgets every dismissed hint, so each shows again when next triggered (Help → Show Hints Again). */
export async function clearDismissedHints(): Promise<void> {
  queue.reset()
  await window.api.clearDismissedHints()
}

export const showHintsAgainCommand = (): Command => ({
  id: 'help.showHintsAgain',
  title: 'Show Hints Again',
  category: 'Help',
  keywords: ['tips', 'first-time', 'reset'],
  run: clearDismissedHints,
})
