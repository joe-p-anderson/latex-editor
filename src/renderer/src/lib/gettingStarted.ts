// Help → Getting Started: the Getting-started vault (src/main/gettingStarted.ts).
// Registered by App.svelte, which opens the vault; its menuOrder places it in Help, after Keyboard Shortcuts.
import type { Command } from './commands'

export const gettingStartedCommand = (run: () => Promise<void>): Command => ({
  id: 'help.gettingStarted',
  title: 'Getting Started',
  category: 'Help',
  keywords: ['tutorial', 'sample', 'example', 'learn'],
  menuOrder: 20,
  run,
})
