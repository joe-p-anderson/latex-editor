// Help → Getting Started: the Getting-started vault (src/main/gettingStarted.ts).
// Registered by App.svelte, which opens the vault; HELP_ORDER places it in the menu.
import type { Command } from './commands'

export const gettingStartedCommand = (run: () => Promise<void>): Command => ({
  id: 'help.gettingStarted',
  title: 'Getting Started',
  category: 'Help',
  keywords: ['tutorial', 'sample', 'example', 'learn'],
  run,
})
